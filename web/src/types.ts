/**
 * Contratto dati condiviso fra frontend e Netlify Functions.
 * Ogni provider SERP viene normalizzato in queste forme: il resto dell'app
 * non sa (e non deve sapere) se i dati vengono da Serper o da DataForSEO.
 */

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type SerpProvider = 'serper' | 'dataforseo'
export type AiProvider = 'openai' | 'anthropic' | 'gemini'

export interface SerpProviderCapabilities {
  /** Risultati organici, PAA, ricerche correlate */
  organic: boolean
  /** AI Overview con testo e fonti citate */
  aiOverview: boolean
  /** Volume, difficoltà, intent, trend (endpoint separati) */
  keywordMetrics: boolean
  /** Costo indicativo per singola query SERP, in USD */
  costPerQueryUsd: number
  label: string
  docsUrl: string
}

export const SERP_CAPABILITIES: Record<SerpProvider, SerpProviderCapabilities> = {
  serper: {
    organic: true,
    aiOverview: false,
    keywordMetrics: false,
    costPerQueryUsd: 0.001,
    label: 'Serper',
    docsUrl: 'https://serper.dev',
  },
  dataforseo: {
    organic: true,
    aiOverview: true,
    keywordMetrics: true,
    costPerQueryUsd: 0.002,
    label: 'DataForSEO',
    docsUrl: 'https://dataforseo.com',
  },
}

// ---------------------------------------------------------------------------
// Credenziali (vivono solo nel browser, mai sul server)
// ---------------------------------------------------------------------------

export interface Credentials {
  serperKey: string
  dataforseoLogin: string
  dataforseoPassword: string
  openaiKey: string
  anthropicKey: string
  geminiKey: string
  /** Chiave Google PageSpeed Insights, opzionale e gratuita */
  psiKey: string
}

export const EMPTY_CREDENTIALS: Credentials = {
  serperKey: '',
  dataforseoLogin: '',
  dataforseoPassword: '',
  openaiKey: '',
  anthropicKey: '',
  geminiKey: '',
  psiKey: '',
}

// ---------------------------------------------------------------------------
// Configurazione analisi
// ---------------------------------------------------------------------------

export interface AnalysisConfig {
  serpProvider: SerpProvider
  aiProvider: AiProvider
  /** Modello per operazioni ad alto volume: classificazione pagine, clustering */
  fastModel: string
  /** Modello per analisi approfondite: AI Overview, brief editoriali */
  strongModel: string

  country: string
  language: string
  device: 'desktop' | 'mobile'
  numResults: number

  ownSiteDomain: string
  customClusters: string[]

  useAiClassification: boolean
  enableClustering: boolean
  enableAiOverviewAnalysis: boolean
  enableStructuredData: boolean
  enableKeywordMetrics: boolean
  enableOnPageAudit: boolean
  enableCoreWebVitals: boolean
  /** Numero di pagine top SERP da analizzare per query */
  maxPagesPerQuery: number
  /** Numero massimo di pagine in AI Overview da analizzare con l'AI */
  maxAiOverviewPages: number
  /** Curva CTR per posizione, usata per Share of Voice e opportunità */
  ctrCurve: number[]
  /** Richieste SERP in parallelo */
  concurrency: number
}

/** Curva CTR organica di riferimento, posizione 1 → 10. Modificabile in UI. */
export const DEFAULT_CTR_CURVE = [
  0.283, 0.155, 0.11, 0.081, 0.061, 0.047, 0.037, 0.031, 0.026, 0.023,
]

export const DEFAULT_CONFIG: AnalysisConfig = {
  serpProvider: 'dataforseo',
  aiProvider: 'anthropic',
  fastModel: '',
  strongModel: '',
  country: 'it',
  language: 'it',
  device: 'desktop',
  numResults: 10,
  ownSiteDomain: '',
  customClusters: [],
  useAiClassification: true,
  enableClustering: true,
  enableAiOverviewAnalysis: true,
  enableStructuredData: true,
  enableKeywordMetrics: true,
  enableOnPageAudit: true,
  enableCoreWebVitals: false,
  maxPagesPerQuery: 5,
  maxAiOverviewPages: 3,
  ctrCurve: DEFAULT_CTR_CURVE,
  concurrency: 4,
}

// ---------------------------------------------------------------------------
// Dati SERP normalizzati
// ---------------------------------------------------------------------------

export type PageType =
  | 'Homepage'
  | 'Pagina di Categoria'
  | 'Pagina Prodotto'
  | 'Articolo di Blog'
  | 'Pagina di Servizi'
  | 'Altro'

export const PAGE_TYPES: PageType[] = [
  'Homepage',
  'Pagina di Categoria',
  'Pagina Prodotto',
  'Articolo di Blog',
  'Pagina di Servizi',
  'Altro',
]

export interface OrganicResult {
  position: number
  title: string
  link: string
  domain: string
  snippet: string
  pageType?: PageType
}

export interface AiOverviewSource {
  position: number
  title: string
  link: string
  domain: string
  snippet: string
}

export interface AiOverviewData {
  present: boolean
  /** Testo dell'AI Overview, in markdown quando il provider lo fornisce */
  text: string
  sources: AiOverviewSource[]
  /** true quando il provider selezionato non è in grado di rilevare l'AI Overview */
  unsupported?: boolean
}

export interface SerpPayload {
  keyword: string
  organic: OrganicResult[]
  peopleAlsoAsk: string[]
  relatedSearches: string[]
  aiOverview: AiOverviewData
  /** Feature SERP presenti (featured snippet, local pack, shopping…) */
  serpFeatures: string[]
  totalResults?: number
  fetchedAt: string
}

// ---------------------------------------------------------------------------
// Metriche keyword (solo DataForSEO Labs)
// ---------------------------------------------------------------------------

export type SearchIntent =
  'informational' | 'navigational' | 'commercial' | 'transactional' | 'unknown'

export interface MonthlySearch {
  year: number
  month: number
  searchVolume: number
}

export interface KeywordMetrics {
  keyword: string
  searchVolume: number | null
  cpc: number | null
  competition: number | null
  difficulty: number | null
  intent: SearchIntent
  monthlySearches: MonthlySearch[]
}

// ---------------------------------------------------------------------------
// Audit on-page e dati strutturati
// ---------------------------------------------------------------------------

export interface PageAudit {
  url: string
  domain: string
  ok: boolean
  error?: string
  statusCode: number
  title: string
  titleLength: number
  metaDescription: string
  metaDescriptionLength: number
  h1: string[]
  h2: string[]
  h3: string[]
  wordCount: number
  images: number
  imagesWithoutAlt: number
  internalLinks: number
  externalLinks: number
  canonical: string
  robots: string
  lang: string
  hreflang: string[]
  schemaTypes: string[]
  hasJsonLd: boolean
  hasFaq: boolean
  hasBreadcrumbs: boolean
  hasReview: boolean
  hasOrganization: boolean
  openGraph: Record<string, string>
  /** Testo ripulito, usato per le analisi AI. Troncato lato server. */
  textSample: string
}

export interface CoreWebVitals {
  url: string
  ok: boolean
  error?: string
  performanceScore: number | null
  lcp: number | null
  cls: number | null
  inp: number | null
  fcp: number | null
  ttfb: number | null
  /** true se i valori vengono dal campo CrUX, false se sono di laboratorio */
  fieldData: boolean
}

// ---------------------------------------------------------------------------
// Output AI
// ---------------------------------------------------------------------------

export interface AiOverviewPageAnalysis {
  keyword: string
  url: string
  domain: string
  title: string
  positionInAi: number
  analysis: string
  schemaTypes: string
}

export interface ContentBrief {
  keyword: string
  h1: string
  outline: { level: 2 | 3; text: string; note?: string }[]
  entities: string[]
  questionsToCover: string[]
  targetWordCount: number
  internalLinks: string[]
  angle: string
}

// ---------------------------------------------------------------------------
// Risultato per keyword e risultato aggregato
// ---------------------------------------------------------------------------

export type KeywordStatus = 'pending' | 'running' | 'done' | 'error' | 'aborted'

export interface KeywordResult {
  keyword: string
  status: KeywordStatus
  error?: string
  serp?: SerpPayload
  metrics?: KeywordMetrics
  audits: PageAudit[]
  vitals: CoreWebVitals[]
  aiPageAnalyses: AiOverviewPageAnalysis[]
  ownSite: {
    inSerp: boolean
    positions: number[]
    urls: string[]
    inAiOverview: boolean
    aiPosition: number | null
  }
  durationMs?: number
}

export interface DomainStat {
  domain: string
  occurrences: number
  bestPosition: number
  avgPosition: number
  keywords: string[]
  pageTypes: Record<string, number>
  /** Share of Voice: traffico stimato / traffico stimato totale */
  shareOfVoice: number
  estimatedTraffic: number
  aiOverviewCitations: number
}

export interface ContentGapItem {
  keyword: string
  searchVolume: number | null
  difficulty: number | null
  intent: SearchIntent
  competitorsInTop10: number
  competitorDomains: string[]
  ownPosition: number | null
  opportunityScore: number
}

export interface CannibalizationItem {
  type: 'stessa-keyword' | 'stesso-url'
  keyword?: string
  url?: string
  urls: string[]
  keywords: string[]
  positions: number[]
  note: string
}

export interface KeywordCluster {
  name: string
  keywords: string[]
  isCustom: boolean
  totalVolume: number
}

export interface AggregatedAnalysis {
  domains: DomainStat[]
  clusters: KeywordCluster[]
  contentGap: ContentGapItem[]
  cannibalization: CannibalizationItem[]
  paa: { question: string; keywords: string[] }[]
  related: { query: string; keywords: string[] }[]
  schemaTypes: { type: string; count: number }[]
  pageTypeDistribution: { type: string; count: number }[]
  intentDistribution: { intent: SearchIntent; count: number; volume: number }[]
  aiOverview: {
    keywordsWithAio: number
    keywordsTotal: number
    topCitedDomains: { domain: string; citations: number }[]
    ownSiteCitations: number
    supported: boolean
  }
  ownSite: {
    domain: string
    inSerpCount: number
    inAiCount: number
    avgPosition: number | null
    estimatedTraffic: number
    shareOfVoice: number
  } | null
  totals: {
    keywords: number
    completed: number
    failed: number
    domains: number
    pagesAudited: number
    totalVolume: number
  }
}

export interface AnalysisRun {
  id: string
  startedAt: string
  finishedAt?: string
  config: AnalysisConfig
  results: KeywordResult[]
  aggregate?: AggregatedAnalysis
  briefs: ContentBrief[]
  isDemo?: boolean
}

// ---------------------------------------------------------------------------
// Progresso del runner
// ---------------------------------------------------------------------------

export interface RunProgress {
  phase: 'idle' | 'serp' | 'metrics' | 'audit' | 'ai' | 'aggregate' | 'done' | 'aborted'
  completed: number
  total: number
  currentKeywords: string[]
  message: string
  errors: { keyword: string; message: string }[]
}

// ---------------------------------------------------------------------------
// Modelli AI
// ---------------------------------------------------------------------------

export interface AiModelInfo {
  id: string
  label: string
  /** Consigliato come modello "veloce" o "forte" */
  tier: 'fast' | 'strong' | 'other'
}
