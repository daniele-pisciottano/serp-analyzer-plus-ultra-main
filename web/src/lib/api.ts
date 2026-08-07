/**
 * Chiamate alle Netlify Functions.
 *
 * Le credenziali viaggiano negli header, mai in querystring, e restano nel
 * browser: le function le usano solo per la singola chiamata in uscita.
 */
import type {
  AnalysisConfig,
  CoreWebVitals,
  Credentials,
  KeywordMetrics,
  PageAudit,
  SerpPayload,
} from '../types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ApiError(String(data.error ?? `Errore ${res.status}`), res.status)
  }
  return data as T
}

function serpHeaders(config: AnalysisConfig, creds: Credentials): Record<string, string> {
  return config.serpProvider === 'serper'
    ? { 'x-serper-key': creds.serperKey.trim() }
    : dfsHeaders(creds)
}

function dfsHeaders(creds: Credentials): Record<string, string> {
  return {
    'x-dfs-login': creds.dataforseoLogin.trim(),
    'x-dfs-password': creds.dataforseoPassword.trim(),
  }
}

export function fetchSerp(
  keyword: string,
  config: AnalysisConfig,
  creds: Credentials,
  signal?: AbortSignal,
): Promise<SerpPayload> {
  return post<SerpPayload>(
    '/api/serp',
    {
      provider: config.serpProvider,
      keyword,
      country: config.country,
      language: config.language,
      device: config.device,
      numResults: config.numResults,
      skipAiOverview: !config.enableAiOverviewAnalysis,
    },
    serpHeaders(config, creds),
    signal,
  )
}

export async function fetchKeywordMetrics(
  keywords: string[],
  config: AnalysisConfig,
  creds: Credentials,
  signal?: AbortSignal,
): Promise<KeywordMetrics[]> {
  const data = await post<{ metrics: KeywordMetrics[] }>(
    '/api/keyword-metrics',
    { keywords, country: config.country, language: config.language },
    dfsHeaders(creds),
    signal,
  )
  return data.metrics
}

export function fetchPageAudit(
  url: string,
  textSampleChars: number,
  signal?: AbortSignal,
): Promise<PageAudit> {
  return post<PageAudit>('/api/page-fetch', { url, textSampleChars }, {}, signal)
}

// ---------------------------------------------------------------------------
// PageSpeed Insights
// ---------------------------------------------------------------------------

interface PsiResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } }
    audits?: Record<string, { numericValue?: number }>
  }
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>
  }
  error?: { message?: string }
}

/**
 * PageSpeed Insights viene chiamato direttamente dal browser: una singola
 * analisi puo' richiedere 20-30 secondi, ben oltre il limite di una Netlify
 * Function sincrona. L'API di Google supporta CORS, quindi non serve il proxy.
 */
export async function fetchCoreWebVitals(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CoreWebVitals> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('strategy', 'mobile')
  endpoint.searchParams.set('category', 'performance')
  if (apiKey) endpoint.searchParams.set('key', apiKey)

  const empty: CoreWebVitals = {
    url,
    ok: false,
    performanceScore: null,
    lcp: null,
    cls: null,
    inp: null,
    fcp: null,
    ttfb: null,
    fieldData: false,
  }

  try {
    const res = await fetch(endpoint.toString(), { signal })
    const data = (await res.json()) as PsiResponse
    if (!res.ok || data.error) {
      return { ...empty, error: data.error?.message ?? `PageSpeed ha risposto ${res.status}` }
    }

    const field = data.loadingExperience?.metrics
    const lab = data.lighthouseResult?.audits
    const hasField = Boolean(field?.LARGEST_CONTENTFUL_PAINT_MS?.percentile)

    return {
      url,
      ok: true,
      performanceScore:
        data.lighthouseResult?.categories?.performance?.score != null
          ? Math.round(data.lighthouseResult.categories.performance.score * 100)
          : null,
      // I dati di campo (CrUX) descrivono utenti reali: quando ci sono, vincono
      lcp: hasField
        ? (field!.LARGEST_CONTENTFUL_PAINT_MS!.percentile ?? null)
        : (lab?.['largest-contentful-paint']?.numericValue ?? null),
      cls: hasField
        ? (field!.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? 0) / 100
        : (lab?.['cumulative-layout-shift']?.numericValue ?? null),
      inp: hasField ? (field!.INTERACTION_TO_NEXT_PAINT?.percentile ?? null) : null,
      fcp: hasField
        ? (field!.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? null)
        : (lab?.['first-contentful-paint']?.numericValue ?? null),
      ttfb: lab?.['server-response-time']?.numericValue ?? null,
      fieldData: hasField,
    }
  } catch (err) {
    if (signal?.aborted) throw err
    return { ...empty, error: err instanceof Error ? err.message : 'Errore di rete' }
  }
}
