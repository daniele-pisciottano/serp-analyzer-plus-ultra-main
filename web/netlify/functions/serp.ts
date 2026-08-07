/**
 * POST /api/serp
 *
 * Una keyword per chiamata: il fan-out lo fa il browser, cosi ogni invocazione
 * resta ampiamente sotto il limite di timeout delle Netlify Functions.
 *
 * Entrambi i provider vengono normalizzati nella stessa forma `SerpPayload`,
 * dichiarata in src/types.ts.
 *
 * Nota sulle capacita': solo DataForSEO espone l'AI Overview in forma
 * strutturata. Con Serper la risposta contiene `aiOverview.unsupported = true`
 * e la UI mostra la sezione come non disponibile invece di fingere un dato.
 */
import type {
  AiOverviewData,
  AiOverviewSource,
  OrganicResult,
  SerpPayload,
  SerpProvider,
} from '../../src/types'
import {
  cleanText,
  domainOf,
  fetchWithTimeout,
  handler,
  HttpError,
  json,
  readJson,
} from '../shared/http'
import { resolveLocation } from '../shared/locations'

interface SerpRequest {
  provider: SerpProvider
  keyword: string
  country: string
  language: string
  device: 'desktop' | 'mobile'
  numResults: number
  /** Salta il caricamento dell'AI Overview (piu' veloce ed economico su DataForSEO) */
  skipAiOverview?: boolean
}

// ---------------------------------------------------------------------------
// Serper
// ---------------------------------------------------------------------------

interface SerperOrganic {
  title?: string
  link?: string
  snippet?: string
  position?: number
}

interface SerperResponse {
  organic?: SerperOrganic[]
  peopleAlsoAsk?: { question?: string }[]
  relatedSearches?: { query?: string }[]
  answerBox?: { title?: string; link?: string; snippet?: string; answer?: string }
  knowledgeGraph?: { title?: string }
  topStories?: unknown[]
  shopping?: unknown[]
  searchParameters?: Record<string, unknown>
  searchInformation?: { totalResults?: number }
}

async function fetchSerper(req: Request, body: SerpRequest): Promise<SerpPayload> {
  const apiKey = req.headers.get('x-serper-key')
  if (!apiKey) throw new HttpError('Credenziale mancante: API key Serper', 401)

  const loc = resolveLocation(body.country)
  const res = await fetchWithTimeout('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      q: body.keyword,
      gl: loc.gl,
      hl: body.language,
      num: body.numResults,
      autocorrect: false,
    }),
    timeoutMs: 8000,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new HttpError(
      res.status === 401 || res.status === 403
        ? 'API key Serper non valida'
        : `Serper ha risposto ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    )
  }

  const data = (await res.json()) as SerperResponse

  const organic: OrganicResult[] = (data.organic ?? [])
    .filter((item) => item.link)
    .slice(0, body.numResults)
    .map((item, index) => ({
      position: item.position ?? index + 1,
      title: cleanText(item.title),
      link: item.link!,
      domain: domainOf(item.link!),
      snippet: cleanText(item.snippet),
    }))

  const serpFeatures: string[] = []
  if (data.answerBox) serpFeatures.push('Answer box')
  if (data.knowledgeGraph) serpFeatures.push('Knowledge graph')
  if (data.peopleAlsoAsk?.length) serpFeatures.push('People also ask')
  if (data.relatedSearches?.length) serpFeatures.push('Ricerche correlate')
  if (data.topStories?.length) serpFeatures.push('Top stories')
  if (data.shopping?.length) serpFeatures.push('Shopping')

  return {
    keyword: body.keyword,
    organic,
    peopleAlsoAsk: (data.peopleAlsoAsk ?? []).map((p) => cleanText(p.question)).filter(Boolean),
    relatedSearches: (data.relatedSearches ?? []).map((r) => cleanText(r.query)).filter(Boolean),
    aiOverview: {
      present: false,
      text: '',
      sources: [],
      unsupported: true,
    },
    serpFeatures,
    totalResults: data.searchInformation?.totalResults,
    fetchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// DataForSEO
// ---------------------------------------------------------------------------

interface DfsItem {
  type?: string
  rank_absolute?: number
  rank_group?: number
  title?: string
  url?: string
  domain?: string
  description?: string
  snippet?: string
  markdown?: string
  text?: string
  items?: DfsItem[]
  references?: DfsReference[]
  seed_question?: string
  asynchronous_ai_overview?: boolean
}

interface DfsReference {
  type?: string
  source?: string
  domain?: string
  url?: string
  title?: string
  text?: string
}

interface DfsResponse {
  status_code?: number
  status_message?: string
  tasks?: {
    status_code?: number
    status_message?: string
    result?: {
      items?: DfsItem[]
      item_types?: string[]
      se_results_count?: number
    }[]
  }[]
}

/** Raccoglie il testo di un AI Overview anche quando arriva spezzato in elementi. */
function collectAiOverviewText(item: DfsItem): string {
  if (item.markdown) return cleanText(item.markdown)

  const parts: string[] = []
  const walk = (node: DfsItem) => {
    if (node.text) parts.push(cleanText(node.text))
    else if (node.snippet) parts.push(cleanText(node.snippet))
    if (node.title && node.type === 'ai_overview_element') parts.unshift(cleanText(node.title))
    node.items?.forEach(walk)
  }
  item.items?.forEach(walk)
  return parts.filter(Boolean).join('\n\n')
}

function collectAiOverviewSources(item: DfsItem): AiOverviewSource[] {
  const refs = item.references ?? []
  return refs
    .filter((ref) => ref.url)
    .map((ref, index) => ({
      position: index + 1,
      title: cleanText(ref.title),
      link: ref.url!,
      domain: ref.domain ? ref.domain.replace(/^www\./, '') : domainOf(ref.url!),
      snippet: cleanText(ref.text),
    }))
}

async function fetchDataForSeo(req: Request, body: SerpRequest): Promise<SerpPayload> {
  const login = req.headers.get('x-dfs-login')
  const password = req.headers.get('x-dfs-password')
  if (!login || !password) {
    throw new HttpError('Credenziali mancanti: login e password DataForSEO', 401)
  }

  const loc = resolveLocation(body.country)
  const auth = Buffer.from(`${login}:${password}`).toString('base64')

  const res = await fetchWithTimeout(
    'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
    {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        {
          keyword: body.keyword,
          location_code: loc.dfsLocationCode,
          language_code: body.language,
          device: body.device,
          os: body.device === 'mobile' ? 'android' : 'windows',
          depth: Math.max(body.numResults, 10),
          // Carica il contenuto completo dell'AI Overview invece del solo placeholder
          load_async_ai_overview: !body.skipAiOverview,
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
        : `DataForSEO ha risposto ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    )
  }

  const data = (await res.json()) as DfsResponse
  const task = data.tasks?.[0]

  // DataForSEO restituisce 200 anche sugli errori applicativi: lo status vero e' nel task.
  if (!task || (task.status_code ?? 0) >= 40000) {
    throw new HttpError(
      `DataForSEO: ${task?.status_message ?? data.status_message ?? 'risposta non valida'}`,
      502,
    )
  }

  const result = task.result?.[0]
  const items = result?.items ?? []

  const organic: OrganicResult[] = items
    .filter((item) => item.type === 'organic' && item.url)
    .slice(0, body.numResults)
    .map((item, index) => ({
      position: item.rank_group ?? index + 1,
      title: cleanText(item.title),
      link: item.url!,
      domain: item.domain ? item.domain.replace(/^www\./, '') : domainOf(item.url!),
      snippet: cleanText(item.description ?? item.snippet),
    }))

  const paaItem = items.find((item) => item.type === 'people_also_ask')
  const peopleAlsoAsk = (paaItem?.items ?? [])
    .map((q) => cleanText(q.title ?? q.seed_question))
    .filter(Boolean)

  const relatedItem = items.find((item) => item.type === 'related_searches')
  const relatedSearches = ((relatedItem?.items ?? []) as unknown as (string | DfsItem)[])
    .map((entry) => (typeof entry === 'string' ? cleanText(entry) : cleanText(entry.title)))
    .filter(Boolean)

  const aioItem = items.find((item) => item.type === 'ai_overview')
  let aiOverview: AiOverviewData = { present: false, text: '', sources: [] }
  if (aioItem) {
    aiOverview = {
      present: true,
      text: collectAiOverviewText(aioItem),
      sources: collectAiOverviewSources(aioItem),
    }
  }

  const featureLabels: Record<string, string> = {
    featured_snippet: 'Featured snippet',
    ai_overview: 'AI Overview',
    people_also_ask: 'People also ask',
    related_searches: 'Ricerche correlate',
    local_pack: 'Local pack',
    shopping: 'Shopping',
    video: 'Video',
    images: 'Immagini',
    top_stories: 'Top stories',
    knowledge_graph: 'Knowledge graph',
    twitter: 'X / Twitter',
    faq: 'FAQ',
  }
  const serpFeatures = (result?.item_types ?? [])
    .map((type) => featureLabels[type])
    .filter((label): label is string => Boolean(label))

  return {
    keyword: body.keyword,
    organic,
    peopleAlsoAsk,
    relatedSearches,
    aiOverview,
    serpFeatures: [...new Set(serpFeatures)],
    totalResults: result?.se_results_count,
    fetchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------

export default handler(async (req) => {
  const body = await readJson<SerpRequest>(req)
  if (!body.keyword?.trim()) throw new HttpError('Keyword mancante', 400)

  const payload =
    body.provider === 'serper' ? await fetchSerper(req, body) : await fetchDataForSeo(req, body)

  return json(payload)
})
