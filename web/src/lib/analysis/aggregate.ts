/**
 * Aggregazioni sui risultati grezzi: domini, Share of Voice, content gap,
 * cannibalizzazione, dati strutturati, AI Overview.
 *
 * Tutto qui dentro e' puro (nessuna I/O), cosi' la modalita' demo usa
 * esattamente lo stesso codice dell'analisi reale.
 */
import type {
  AggregatedAnalysis,
  AnalysisConfig,
  CannibalizationItem,
  ContentGapItem,
  DomainStat,
  KeywordCluster,
  KeywordResult,
  SearchIntent,
} from '../../types'

/** CTR stimata per una posizione, oltre la curva decade verso zero. */
export function ctrForPosition(position: number, curve: number[]): number {
  if (position < 1) return 0
  if (position <= curve.length) return curve[position - 1]
  // Coda lunga: dimezza ogni 10 posizioni oltre la curva nota
  const last = curve[curve.length - 1] ?? 0.02
  return last / Math.pow(2, (position - curve.length) / 10)
}

/**
 * Quando mancano i volumi (provider senza metriche keyword) usiamo 1 come peso:
 * lo Share of Voice diventa una quota basata solo sulle posizioni, che resta
 * confrontabile fra domini.
 */
function volumeOf(result: KeywordResult): number {
  return result.metrics?.searchVolume ?? 1
}

export function hasRealVolumes(results: KeywordResult[]): boolean {
  return results.some((r) => r.metrics?.searchVolume != null)
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '')
}

export function matchesOwnSite(domain: string, ownSiteDomain: string): boolean {
  if (!ownSiteDomain) return false
  const own = normalizeDomain(ownSiteDomain)
  const candidate = normalizeDomain(domain)
  return candidate === own || candidate.endsWith(`.${own}`)
}

// ---------------------------------------------------------------------------

function buildDomainStats(results: KeywordResult[], config: AnalysisConfig): DomainStat[] {
  const map = new Map<string, DomainStat>()

  for (const result of results) {
    if (!result.serp) continue
    const volume = volumeOf(result)

    for (const item of result.serp.organic) {
      const domain = normalizeDomain(item.domain)
      if (!domain) continue

      const stat =
        map.get(domain) ??
        ({
          domain,
          occurrences: 0,
          bestPosition: item.position,
          avgPosition: 0,
          keywords: [],
          pageTypes: {},
          shareOfVoice: 0,
          estimatedTraffic: 0,
          aiOverviewCitations: 0,
        } satisfies DomainStat)

      stat.occurrences += 1
      stat.bestPosition = Math.min(stat.bestPosition, item.position)
      // avgPosition accumula la somma, viene divisa alla fine
      stat.avgPosition += item.position
      if (!stat.keywords.includes(result.keyword)) stat.keywords.push(result.keyword)
      if (item.pageType) stat.pageTypes[item.pageType] = (stat.pageTypes[item.pageType] ?? 0) + 1
      stat.estimatedTraffic += volume * ctrForPosition(item.position, config.ctrCurve)

      map.set(domain, stat)
    }

    for (const source of result.serp.aiOverview.sources) {
      const domain = normalizeDomain(source.domain)
      if (!domain) continue
      const stat = map.get(domain)
      if (stat) stat.aiOverviewCitations += 1
      else
        map.set(domain, {
          domain,
          occurrences: 0,
          bestPosition: 99,
          avgPosition: 0,
          keywords: [result.keyword],
          pageTypes: {},
          shareOfVoice: 0,
          estimatedTraffic: 0,
          aiOverviewCitations: 1,
        })
    }
  }

  const stats = [...map.values()]
  const totalTraffic = stats.reduce((sum, s) => sum + s.estimatedTraffic, 0)

  for (const stat of stats) {
    stat.avgPosition = stat.occurrences > 0 ? stat.avgPosition / stat.occurrences : 0
    stat.shareOfVoice = totalTraffic > 0 ? stat.estimatedTraffic / totalTraffic : 0
  }

  return stats.sort(
    (a, b) => b.estimatedTraffic - a.estimatedTraffic || b.occurrences - a.occurrences,
  )
}

// ---------------------------------------------------------------------------

function buildContentGap(results: KeywordResult[], config: AnalysisConfig): ContentGapItem[] {
  if (!config.ownSiteDomain) return []
  const maxCtr = config.ctrCurve[0] ?? 0.28

  const gaps: ContentGapItem[] = []

  for (const result of results) {
    if (!result.serp) continue

    const top10 = result.serp.organic.filter((item) => item.position <= 10)
    const ownEntry = top10.find((item) => matchesOwnSite(item.domain, config.ownSiteDomain))
    const competitorDomains = [
      ...new Set(
        top10
          .filter((item) => !matchesOwnSite(item.domain, config.ownSiteDomain))
          .map((item) => normalizeDomain(item.domain)),
      ),
    ]

    // Il gap esiste quando almeno due competitor presidiano la keyword e noi no
    if (competitorDomains.length < 2) continue
    if (ownEntry && ownEntry.position <= 3) continue

    const volume = result.metrics?.searchVolume ?? 0
    const difficulty = result.metrics?.difficulty ?? null
    const ownCtr = ownEntry ? ctrForPosition(ownEntry.position, config.ctrCurve) : 0
    const upside = Math.max(maxCtr - ownCtr, 0)
    // Il traffico potenzialmente recuperabile, smorzato dalla difficolta'
    const opportunity = (volume || 1) * upside * (1 / (1 + (difficulty ?? 30) / 25))

    gaps.push({
      keyword: result.keyword,
      searchVolume: result.metrics?.searchVolume ?? null,
      difficulty,
      intent: result.metrics?.intent ?? 'unknown',
      competitorsInTop10: competitorDomains.length,
      competitorDomains: competitorDomains.slice(0, 5),
      ownPosition: ownEntry?.position ?? null,
      opportunityScore: Math.round(opportunity * 100) / 100,
    })
  }

  return gaps.sort((a, b) => b.opportunityScore - a.opportunityScore)
}

// ---------------------------------------------------------------------------

function buildCannibalization(
  results: KeywordResult[],
  clusters: KeywordCluster[],
  config: AnalysisConfig,
): CannibalizationItem[] {
  if (!config.ownSiteDomain) return []
  const items: CannibalizationItem[] = []

  // Caso 1: piu' URL nostri competono sulla stessa keyword
  for (const result of results) {
    if (!result.serp) continue
    const ours = result.serp.organic.filter((item) =>
      matchesOwnSite(item.domain, config.ownSiteDomain),
    )
    const uniqueUrls = [...new Set(ours.map((item) => item.link))]
    if (uniqueUrls.length > 1) {
      items.push({
        type: 'stessa-keyword',
        keyword: result.keyword,
        urls: uniqueUrls,
        keywords: [result.keyword],
        positions: ours.map((item) => item.position).sort((a, b) => a - b),
        note: `${uniqueUrls.length} tue pagine competono sulla stessa query: Google non ha un candidato chiaro.`,
      })
    }
  }

  // Caso 2: uno stesso URL posiziona su keyword di cluster diversi
  const clusterOf = new Map<string, string>()
  for (const cluster of clusters) {
    for (const keyword of cluster.keywords) clusterOf.set(keyword.toLowerCase(), cluster.name)
  }

  const urlToKeywords = new Map<string, Set<string>>()
  for (const result of results) {
    if (!result.serp) continue
    for (const item of result.serp.organic) {
      if (!matchesOwnSite(item.domain, config.ownSiteDomain)) continue
      const set = urlToKeywords.get(item.link) ?? new Set<string>()
      set.add(result.keyword)
      urlToKeywords.set(item.link, set)
    }
  }

  for (const [url, keywordSet] of urlToKeywords) {
    const keywords = [...keywordSet]
    const involvedClusters = [
      ...new Set(keywords.map((k) => clusterOf.get(k.toLowerCase())).filter(Boolean) as string[]),
    ]
    if (involvedClusters.length > 1) {
      items.push({
        type: 'stesso-url',
        url,
        urls: [url],
        keywords,
        positions: [],
        note: `Questa pagina intercetta intenti diversi (${involvedClusters.join(', ')}): valuta se separarla in piu' contenuti.`,
      })
    }
  }

  return items
}

// ---------------------------------------------------------------------------

function countBy<T>(
  items: T[],
  key: (item: T) => string | undefined,
): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------

export function aggregate(
  results: KeywordResult[],
  clusters: KeywordCluster[],
  config: AnalysisConfig,
): AggregatedAnalysis {
  const completed = results.filter((r) => r.status === 'done')
  const domains = buildDomainStats(completed, config)

  // PAA e ricerche correlate: quali keyword le hanno generate
  const paaMap = new Map<string, Set<string>>()
  const relatedMap = new Map<string, Set<string>>()
  for (const result of completed) {
    for (const question of result.serp?.peopleAlsoAsk ?? []) {
      const set = paaMap.get(question) ?? new Set<string>()
      set.add(result.keyword)
      paaMap.set(question, set)
    }
    for (const query of result.serp?.relatedSearches ?? []) {
      const set = relatedMap.get(query) ?? new Set<string>()
      set.add(result.keyword)
      relatedMap.set(query, set)
    }
  }

  const allAudits = completed.flatMap((r) => r.audits)
  const schemaTypes = countBy(
    allAudits.flatMap((audit) => audit.schemaTypes),
    (type) => type,
  ).map(({ name, count }) => ({ type: name, count }))

  const pageTypeDistribution = countBy(
    completed.flatMap((r) => r.serp?.organic ?? []),
    (item) => item.pageType,
  ).map(({ name, count }) => ({ type: name, count }))

  const intentMap = new Map<SearchIntent, { count: number; volume: number }>()
  for (const result of completed) {
    const intent = result.metrics?.intent ?? 'unknown'
    const entry = intentMap.get(intent) ?? { count: 0, volume: 0 }
    entry.count += 1
    entry.volume += result.metrics?.searchVolume ?? 0
    intentMap.set(intent, entry)
  }

  const aioSupported = completed.some((r) => r.serp && !r.serp.aiOverview.unsupported)
  const keywordsWithAio = completed.filter((r) => r.serp?.aiOverview.present).length
  const aioCitations = new Map<string, number>()
  for (const result of completed) {
    for (const source of result.serp?.aiOverview.sources ?? []) {
      const domain = normalizeDomain(source.domain)
      if (domain) aioCitations.set(domain, (aioCitations.get(domain) ?? 0) + 1)
    }
  }

  const ownDomain = config.ownSiteDomain ? normalizeDomain(config.ownSiteDomain) : ''
  const ownStat = ownDomain ? domains.find((d) => matchesOwnSite(d.domain, ownDomain)) : undefined
  const ownPositions = completed.flatMap((r) => r.ownSite.positions).filter((p) => p > 0)

  // I volumi alimentano i totali dei cluster, cosi' il treemap resta leggibile
  const volumeByKeyword = new Map(
    completed.map((r) => [r.keyword.toLowerCase(), r.metrics?.searchVolume ?? 0]),
  )
  const clustersWithVolume = clusters.map((cluster) => ({
    ...cluster,
    totalVolume: cluster.keywords.reduce(
      (sum, keyword) => sum + (volumeByKeyword.get(keyword.toLowerCase()) ?? 0),
      0,
    ),
  }))

  return {
    domains,
    clusters: clustersWithVolume,
    contentGap: buildContentGap(completed, config),
    cannibalization: buildCannibalization(completed, clustersWithVolume, config),
    paa: [...paaMap.entries()]
      .map(([question, keywords]) => ({ question, keywords: [...keywords] }))
      .sort((a, b) => b.keywords.length - a.keywords.length),
    related: [...relatedMap.entries()]
      .map(([query, keywords]) => ({ query, keywords: [...keywords] }))
      .sort((a, b) => b.keywords.length - a.keywords.length),
    schemaTypes,
    pageTypeDistribution,
    intentDistribution: [...intentMap.entries()]
      .map(([intent, data]) => ({ intent, ...data }))
      .sort((a, b) => b.count - a.count),
    aiOverview: {
      keywordsWithAio,
      keywordsTotal: completed.length,
      topCitedDomains: [...aioCitations.entries()]
        .map(([domain, citations]) => ({ domain, citations }))
        .sort((a, b) => b.citations - a.citations)
        .slice(0, 15),
      ownSiteCitations: completed.filter((r) => r.ownSite.inAiOverview).length,
      supported: aioSupported,
    },
    ownSite: ownDomain
      ? {
          domain: ownDomain,
          inSerpCount: completed.filter((r) => r.ownSite.inSerp).length,
          inAiCount: completed.filter((r) => r.ownSite.inAiOverview).length,
          avgPosition: ownPositions.length
            ? ownPositions.reduce((a, b) => a + b, 0) / ownPositions.length
            : null,
          estimatedTraffic: ownStat?.estimatedTraffic ?? 0,
          shareOfVoice: ownStat?.shareOfVoice ?? 0,
        }
      : null,
    totals: {
      keywords: results.length,
      completed: completed.length,
      failed: results.filter((r) => r.status === 'error').length,
      domains: domains.length,
      pagesAudited: allAudits.filter((a) => a.ok).length,
      totalVolume: completed.reduce((sum, r) => sum + (r.metrics?.searchVolume ?? 0), 0),
    },
  }
}
