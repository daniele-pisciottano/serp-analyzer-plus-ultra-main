/**
 * Orchestratore dell'analisi.
 *
 * Il fan-out lo fa il browser: ogni keyword e' una chiamata separata alla
 * function, con concorrenza limitata. Questo tiene ogni invocazione ben sotto
 * il timeout delle Netlify Functions e permette progressi reali, risultati
 * incrementali e uno stop che conserva quello che e' gia' stato raccolto.
 */
import { fetchCoreWebVitals, fetchKeywordMetrics, fetchPageAudit, fetchSerp } from './api'
import { aggregate, matchesOwnSite } from './analysis/aggregate'
import {
  analyzeAiOverviewPage,
  classifyByRules,
  classifyPagesWithAi,
  clusterKeywords,
  clusterKeywordsSimple,
  type AiContext,
} from './ai/tasks'
import { isAborted, pool, withRetry } from './pool'
import type {
  AnalysisConfig,
  AnalysisRun,
  Credentials,
  KeywordCluster,
  KeywordResult,
  PageAudit,
  RunProgress,
} from '../types'

export interface RunnerCallbacks {
  onProgress: (progress: RunProgress) => void
  onResult: (result: KeywordResult) => void
}

interface RunnerInput extends RunnerCallbacks {
  keywords: string[]
  config: AnalysisConfig
  credentials: Credentials
  signal: AbortSignal
}

function emptyResult(keyword: string): KeywordResult {
  return {
    keyword,
    status: 'pending',
    audits: [],
    vitals: [],
    aiPageAnalyses: [],
    ownSite: { inSerp: false, positions: [], urls: [], inAiOverview: false, aiPosition: null },
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Audit segnaposto per una pagina non raggiungibile: la riga resta visibile in tabella. */
function failedAudit(url: string, error: string): PageAudit {
  return {
    url,
    domain: '',
    ok: false,
    error,
    statusCode: 0,
    title: '',
    titleLength: 0,
    metaDescription: '',
    metaDescriptionLength: 0,
    h1: [],
    h2: [],
    h3: [],
    wordCount: 0,
    images: 0,
    imagesWithoutAlt: 0,
    internalLinks: 0,
    externalLinks: 0,
    canonical: '',
    robots: '',
    lang: '',
    hreflang: [],
    schemaTypes: [],
    hasJsonLd: false,
    hasFaq: false,
    hasBreadcrumbs: false,
    hasReview: false,
    hasOrganization: false,
    openGraph: {},
    textSample: '',
  }
}

export async function runAnalysis(input: RunnerInput): Promise<AnalysisRun> {
  const { keywords, config, credentials, signal, onProgress, onResult } = input
  const started = Date.now()

  const results = keywords.map(emptyResult)
  const byKeyword = new Map(results.map((r) => [r.keyword, r]))
  const errors: RunProgress['errors'] = []
  const running = new Set<string>()

  const aiContext: AiContext = {
    provider: config.aiProvider,
    fastModel: config.fastModel,
    strongModel: config.strongModel,
    credentials,
    signal,
  }

  let phase: RunProgress['phase'] = 'serp'
  let completed = 0
  let message = ''

  const report = () => {
    onProgress({
      phase,
      completed,
      total: keywords.length,
      currentKeywords: [...running],
      message,
      errors: [...errors],
    })
  }

  const useAi =
    config.useAiClassification && Boolean(config.strongModel) && Boolean(config.fastModel)

  // -------------------------------------------------------------------------
  // Fase 1: SERP, una keyword per chiamata
  // -------------------------------------------------------------------------
  phase = 'serp'
  message = 'Recupero delle SERP'
  report()

  await pool(results, config.concurrency, async (result) => {
    if (signal.aborted) {
      result.status = 'aborted'
      return
    }

    const startedAt = Date.now()
    result.status = 'running'
    running.add(result.keyword)
    report()

    try {
      const serp = await withRetry(() => fetchSerp(result.keyword, config, credentials, signal), {
        signal,
      })

      // Classificazione a regole: copre la maggior parte dei risultati senza AI
      for (const item of serp.organic) {
        const type = classifyByRules(item.link, item.title)
        if (type) item.pageType = type
      }

      const ownPositions = serp.organic.filter((item) =>
        matchesOwnSite(item.domain, config.ownSiteDomain),
      )
      const ownAioIndex = serp.aiOverview.sources.findIndex((source) =>
        matchesOwnSite(source.domain, config.ownSiteDomain),
      )

      result.serp = serp
      result.ownSite = {
        inSerp: ownPositions.length > 0,
        positions: ownPositions.map((item) => item.position),
        urls: ownPositions.map((item) => item.link),
        inAiOverview: ownAioIndex >= 0,
        aiPosition: ownAioIndex >= 0 ? ownAioIndex + 1 : null,
      }
      result.status = 'done'
    } catch (err) {
      if (isAborted(err)) {
        result.status = 'aborted'
      } else {
        result.status = 'error'
        result.error = errorMessage(err)
        errors.push({ keyword: result.keyword, message: result.error })
      }
    } finally {
      result.durationMs = Date.now() - startedAt
      running.delete(result.keyword)
      completed += 1
      onResult(result)
      report()
    }
  })

  const done = results.filter((r) => r.status === 'done')

  // -------------------------------------------------------------------------
  // Fase 2: metriche keyword, una sola chiamata in batch
  // -------------------------------------------------------------------------
  const canFetchMetrics =
    config.enableKeywordMetrics &&
    Boolean(credentials.dataforseoLogin.trim() && credentials.dataforseoPassword.trim())

  if (canFetchMetrics && done.length > 0 && !signal.aborted) {
    phase = 'metrics'
    message = 'Volume, difficolta e intento di ricerca'
    report()

    try {
      const metrics = await withRetry(
        () =>
          fetchKeywordMetrics(
            done.map((r) => r.keyword),
            config,
            credentials,
            signal,
          ),
        { signal },
      )
      const byKw = new Map(metrics.map((m) => [m.keyword.toLowerCase(), m]))
      for (const result of done) {
        const match = byKw.get(result.keyword.toLowerCase())
        if (match) {
          result.metrics = match
          onResult(result)
        }
      }
    } catch (err) {
      if (!isAborted(err)) {
        errors.push({ keyword: '(metriche keyword)', message: errorMessage(err) })
      }
    }
    report()
  }

  // -------------------------------------------------------------------------
  // Fase 3: audit on-page delle pagine in SERP e delle fonti AI Overview
  // -------------------------------------------------------------------------
  interface AuditJob {
    keyword: string
    url: string
    needsText: boolean
  }

  const auditJobs: AuditJob[] = []
  if ((config.enableOnPageAudit || config.enableStructuredData) && !signal.aborted) {
    for (const result of done) {
      const serpUrls = (result.serp?.organic ?? [])
        .slice(0, config.maxPagesPerQuery)
        .map((item) => item.link)

      const aioUrls = config.enableAiOverviewAnalysis
        ? (result.serp?.aiOverview.sources ?? [])
            .slice(0, config.maxAiOverviewPages)
            .map((source) => source.link)
        : []

      for (const url of new Set([...serpUrls, ...aioUrls])) {
        auditJobs.push({ keyword: result.keyword, url, needsText: aioUrls.includes(url) })
      }
    }
  }

  if (auditJobs.length > 0) {
    phase = 'audit'
    let auditsDone = 0
    message = `Audit on-page: 0/${auditJobs.length} pagine`
    report()

    await pool(auditJobs, config.concurrency, async (job) => {
      if (signal.aborted) return
      try {
        // Il testo serve solo alle pagine che finiranno in analisi AI
        const audit = await fetchPageAudit(job.url, job.needsText ? 6000 : 0, signal)
        byKeyword.get(job.keyword)?.audits.push(audit)
      } catch (err) {
        if (isAborted(err)) return
        byKeyword.get(job.keyword)?.audits.push(failedAudit(job.url, errorMessage(err)))
      } finally {
        auditsDone += 1
        message = `Audit on-page: ${auditsDone}/${auditJobs.length} pagine`
        const result = byKeyword.get(job.keyword)
        if (result) onResult(result)
        report()
      }
    })
  }

  // -------------------------------------------------------------------------
  // Fase 4: lavoro AI (classificazione residua, clustering, analisi AI Overview)
  // -------------------------------------------------------------------------
  let clusters: KeywordCluster[] = []

  if (!signal.aborted) {
    phase = 'ai'

    // 4a. Classificazione delle pagine che le regole non hanno coperto
    if (useAi) {
      const pending = done
        .flatMap((r) => r.serp?.organic ?? [])
        .filter((item) => !item.pageType)
        .map((item) => ({ url: item.link, title: item.title }))

      if (pending.length > 0) {
        message = `Classificazione AI di ${pending.length} pagine`
        report()
        try {
          const classified = await classifyPagesWithAi(pending, aiContext)
          for (const result of done) {
            for (const item of result.serp?.organic ?? []) {
              if (!item.pageType) item.pageType = classified.get(item.link) ?? 'Altro'
            }
          }
        } catch (err) {
          if (!isAborted(err)) {
            errors.push({ keyword: '(classificazione AI)', message: errorMessage(err) })
            // Senza AI restano "Altro": meglio di un'analisi interrotta
            for (const result of done) {
              for (const item of result.serp?.organic ?? []) {
                if (!item.pageType) item.pageType = 'Altro'
              }
            }
          }
        }
      }
    } else {
      for (const result of done) {
        for (const item of result.serp?.organic ?? []) {
          if (!item.pageType) item.pageType = 'Altro'
        }
      }
    }

    // 4b. Clustering semantico
    if (config.enableClustering && done.length > 0) {
      message = 'Clustering semantico delle keyword'
      report()
      const keywordList = done.map((r) => r.keyword)
      if (useAi) {
        try {
          clusters = await clusterKeywords(keywordList, config.customClusters, aiContext)
        } catch (err) {
          if (!isAborted(err)) {
            errors.push({ keyword: '(clustering)', message: errorMessage(err) })
            clusters = clusterKeywordsSimple(keywordList, config.customClusters)
          }
        }
      } else {
        clusters = clusterKeywordsSimple(keywordList, config.customClusters)
      }
    }

    // 4c. Analisi delle pagine citate in AI Overview
    if (config.enableAiOverviewAnalysis && useAi) {
      const jobs = done.flatMap((result) =>
        (result.serp?.aiOverview.sources ?? [])
          .slice(0, config.maxAiOverviewPages)
          .map((source, index) => ({ result, source, index })),
      )

      if (jobs.length > 0) {
        let analysed = 0
        message = `Analisi AI Overview: 0/${jobs.length} pagine`
        report()

        // Concorrenza piu' bassa: qui il collo di bottiglia sono i rate limit del provider AI
        await pool(jobs, Math.min(config.concurrency, 3), async (job) => {
          if (signal.aborted) return
          const audit = job.result.audits.find((a) => a.url === job.source.link && a.ok)
          try {
            const analysis = audit
              ? await analyzeAiOverviewPage(job.result.keyword, audit, aiContext)
              : 'Contenuto della pagina non recuperabile: analisi non disponibile.'

            job.result.aiPageAnalyses.push({
              keyword: job.result.keyword,
              url: job.source.link,
              domain: job.source.domain,
              title: job.source.title,
              positionInAi: job.index + 1,
              analysis,
              schemaTypes: audit?.schemaTypes.join(', ') ?? '',
            })
          } catch (err) {
            if (isAborted(err)) return
            errors.push({ keyword: job.result.keyword, message: errorMessage(err) })
          } finally {
            analysed += 1
            message = `Analisi AI Overview: ${analysed}/${jobs.length} pagine`
            onResult(job.result)
            report()
          }
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // Fase 5: Core Web Vitals delle nostre pagine (chiamata diretta a PageSpeed)
  // -------------------------------------------------------------------------
  if (config.enableCoreWebVitals && config.ownSiteDomain && !signal.aborted) {
    const ownUrls = [...new Set(done.flatMap((r) => r.ownSite.urls))].slice(0, 5)
    if (ownUrls.length > 0) {
      message = `Core Web Vitals: ${ownUrls.length} pagine del tuo sito`
      report()

      await pool(ownUrls, 2, async (url) => {
        if (signal.aborted) return
        const vitals = await fetchCoreWebVitals(url, credentials.psiKey.trim(), signal).catch(
          () => null,
        )
        if (!vitals) return
        for (const result of done) {
          if (result.ownSite.urls.includes(url)) {
            result.vitals.push(vitals)
            onResult(result)
          }
        }
      })
    }
  }

  // -------------------------------------------------------------------------
  // Fase 6: aggregazioni
  // -------------------------------------------------------------------------
  phase = signal.aborted ? 'aborted' : 'aggregate'
  message = 'Calcolo di Share of Voice, gap e cannibalizzazione'
  report()

  const aggregateResult = aggregate(results, clusters, config)

  phase = signal.aborted ? 'aborted' : 'done'
  const succeeded = results.filter((r) => r.status === 'done').length
  message = signal.aborted
    ? 'Analisi interrotta: i risultati raccolti sono conservati'
    : succeeded === 0
      ? 'Nessuna keyword recuperata: vedi il dettaglio degli errori'
      : succeeded < results.length
        ? `Analisi completata su ${succeeded} keyword su ${results.length}`
        : 'Analisi completata'
  report()

  return {
    id: `run-${started}`,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    config,
    results,
    aggregate: aggregateResult,
    briefs: [],
  }
}
