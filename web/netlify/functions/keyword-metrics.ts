/**
 * POST /api/keyword-metrics
 *
 * Volume di ricerca, CPC, competition, keyword difficulty, search intent e
 * trend a 12 mesi. Solo DataForSEO Labs: e' l'unico dei due provider che
 * espone queste metriche.
 *
 * Le keyword vengono inviate in batch (l'endpoint ne accetta fino a 700 per
 * chiamata), quindi anche un'analisi da 100 keyword resta una sola richiesta.
 */
import type { KeywordMetrics, MonthlySearch, SearchIntent } from '../../src/types'
import { fetchWithTimeout, handler, HttpError, json, readJson } from '../shared/http'
import { resolveLocation } from '../shared/locations'

interface MetricsRequest {
  keywords: string[]
  country: string
  language: string
}

interface DfsKeywordItem {
  keyword?: string
  keyword_info?: {
    search_volume?: number | null
    cpc?: number | null
    competition?: number | null
    monthly_searches?: { year?: number; month?: number; search_volume?: number }[]
  }
  keyword_properties?: {
    keyword_difficulty?: number | null
  }
  search_intent_info?: {
    main_intent?: string | null
  }
}

interface DfsMetricsResponse {
  status_message?: string
  tasks?: {
    status_code?: number
    status_message?: string
    result?: { items?: DfsKeywordItem[] }[]
  }[]
}

const INTENTS: SearchIntent[] = ['informational', 'navigational', 'commercial', 'transactional']

function normalizeIntent(value: string | null | undefined): SearchIntent {
  const lower = (value ?? '').toLowerCase()
  return INTENTS.find((intent) => intent === lower) ?? 'unknown'
}

/** DataForSEO accetta al massimo 700 keyword per richiesta. */
const BATCH_SIZE = 700

export default handler(async (req) => {
  const body = await readJson<MetricsRequest>(req)
  const login = req.headers.get('x-dfs-login')
  const password = req.headers.get('x-dfs-password')
  if (!login || !password) {
    throw new HttpError(
      'Le metriche keyword richiedono le credenziali DataForSEO, anche se le SERP arrivano da Serper',
      401,
    )
  }

  const keywords = [
    ...new Set((body.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean)),
  ]
  if (keywords.length === 0) throw new HttpError('Nessuna keyword da analizzare', 400)

  const loc = resolveLocation(body.country)
  const auth = Buffer.from(`${login}:${password}`).toString('base64')
  const metrics: KeywordMetrics[] = []

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE)

    const res = await fetchWithTimeout(
      'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live',
      {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          {
            keywords: batch,
            location_code: loc.dfsLocationCode,
            language_code: body.language,
            include_serp_info: false,
            include_clickstream_data: false,
          },
        ]),
        timeoutMs: 9000,
      },
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new HttpError(
        res.status === 401
          ? 'Credenziali DataForSEO non valide'
          : `DataForSEO Labs ha risposto ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      )
    }

    const data = (await res.json()) as DfsMetricsResponse
    const task = data.tasks?.[0]
    if (!task || (task.status_code ?? 0) >= 40000) {
      throw new HttpError(
        `DataForSEO Labs: ${task?.status_message ?? data.status_message ?? 'risposta non valida'}`,
        502,
      )
    }

    for (const item of task.result?.[0]?.items ?? []) {
      if (!item.keyword) continue
      const monthly: MonthlySearch[] = (item.keyword_info?.monthly_searches ?? [])
        .filter((m) => m.year != null && m.month != null)
        .map((m) => ({
          year: m.year!,
          month: m.month!,
          searchVolume: m.search_volume ?? 0,
        }))

      metrics.push({
        keyword: item.keyword,
        searchVolume: item.keyword_info?.search_volume ?? null,
        cpc: item.keyword_info?.cpc ?? null,
        competition: item.keyword_info?.competition ?? null,
        difficulty: item.keyword_properties?.keyword_difficulty ?? null,
        intent: normalizeIntent(item.search_intent_info?.main_intent),
        monthlySearches: monthly,
      })
    }
  }

  return json({ metrics })
})
