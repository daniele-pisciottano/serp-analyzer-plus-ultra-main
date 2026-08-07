/**
 * Inserimento keyword, stima costi, avvio e monitoraggio dell'analisi.
 */
import { useMemo } from 'react'
import { AlertTriangle, Loader2, Play, Square } from 'lucide-react'
import type { AnalysisConfig, Credentials, KeywordResult, RunProgress } from '../types'
import { SERP_CAPABILITIES } from '../types'
import { needsAi, resolveConfig } from '../lib/config'

const MAX_KEYWORDS = 200

interface AnalysisPanelProps {
  keywordsText: string
  onKeywordsChange: (value: string) => void
  config: AnalysisConfig
  credentials: Credentials
  progress: RunProgress
  results: KeywordResult[]
  isRunning: boolean
  onStart: () => void
  onStop: () => void
}

export function parseKeywords(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split('\n')) {
    const keyword = line.trim()
    if (!keyword) continue
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(keyword)
  }
  return out
}

/**
 * Controlli che devono passare prima di poter lanciare l'analisi.
 * Ragiona sulla configurazione effettiva: un'opzione che il provider non
 * supporta e' gia' spenta, quindi non puo' richiedere credenziali inutili.
 */
export function validateRun(
  keywords: string[],
  rawConfig: AnalysisConfig,
  credentials: Credentials,
): string[] {
  const config = resolveConfig(rawConfig, credentials)
  const problems: string[] = []

  if (keywords.length === 0) problems.push('Inserisci almeno una keyword.')
  if (keywords.length > MAX_KEYWORDS) {
    problems.push(`Massimo ${MAX_KEYWORDS} keyword per analisi: ne hai ${keywords.length}.`)
  }

  if (config.serpProvider === 'serper' && !credentials.serperKey.trim()) {
    problems.push('Manca la API key di Serper.')
  }
  if (
    config.serpProvider === 'dataforseo' &&
    !(credentials.dataforseoLogin.trim() && credentials.dataforseoPassword.trim())
  ) {
    problems.push('Mancano login e password DataForSEO.')
  }

  if (needsAi(config)) {
    const key = {
      openai: credentials.openaiKey,
      anthropic: credentials.anthropicKey,
      gemini: credentials.geminiKey,
    }[config.aiProvider]
    if (!key.trim()) {
      problems.push(
        `Le funzioni AI sono attive ma manca la API key ${config.aiProvider}. Inseriscila o disattivale.`,
      )
    } else if (!config.strongModel || !config.fastModel) {
      problems.push('Seleziona i modelli AI nella configurazione.')
    }
  }

  return problems
}

/**
 * Stima dei costi. Le chiamate SERP sono esatte, i token AI sono una stima
 * prudente basata sulla dimensione media dei prompt che generiamo.
 */
function estimateCost(keywords: number, config: AnalysisConfig) {
  const serpCost = keywords * SERP_CAPABILITIES[config.serpProvider].costPerQueryUsd
  const metricsCost = config.enableKeywordMetrics ? 0.02 : 0
  const pagesPerKeyword =
    config.enableOnPageAudit || config.enableStructuredData ? config.maxPagesPerQuery : 0

  // Ordine di grandezza: classificazione + clustering + una analisi per fonte AI Overview
  const aiCalls =
    (config.useAiClassification ? Math.ceil((keywords * config.numResults) / 40) : 0) +
    (config.enableClustering ? Math.ceil(keywords / 60) : 0) +
    (config.enableAiOverviewAnalysis ? keywords * config.maxAiOverviewPages * 0.4 : 0)
  const aiCost = aiCalls * 0.02

  return {
    serpCalls: keywords,
    pageFetches: keywords * pagesPerKeyword,
    aiCalls: Math.round(aiCalls),
    totalUsd: serpCost + metricsCost + aiCost,
  }
}

const PHASE_LABELS: Record<RunProgress['phase'], string> = {
  idle: 'In attesa',
  serp: 'Lettura delle SERP',
  metrics: 'Metriche keyword',
  audit: 'Audit on-page',
  ai: 'Analisi AI',
  aggregate: 'Calcolo delle aggregazioni',
  done: 'Completata',
  aborted: 'Interrotta',
}

export function AnalysisPanel({
  keywordsText,
  onKeywordsChange,
  config,
  credentials,
  progress,
  results,
  isRunning,
  onStart,
  onStop,
}: AnalysisPanelProps) {
  const keywords = useMemo(() => parseKeywords(keywordsText), [keywordsText])
  const problems = useMemo(
    () => validateRun(keywords, config, credentials),
    [keywords, config, credentials],
  )
  // La stima segue la configurazione effettiva: quello che non verra' eseguito
  // non deve comparire nel costo
  const estimate = useMemo(
    () => estimateCost(keywords.length, resolveConfig(config, credentials)),
    [keywords.length, config, credentials],
  )

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
  const doneCount = results.filter((r) => r.status === 'done').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="card p-5">
        <h3 className="text-sm font-semibold text-ink">Keyword da analizzare</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Una per riga. I duplicati vengono rimossi automaticamente.
        </p>

        <textarea
          className="input mt-4 min-h-[320px] font-mono text-sm"
          placeholder={
            'scarpe da running\nmigliori scarpe running 2026\nscarpe running principianti'
          }
          value={keywordsText}
          disabled={isRunning}
          onChange={(e) => onKeywordsChange(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">{keywords.length}</span> keyword
            {keywords.length > MAX_KEYWORDS && (
              <span className="ml-2 text-brand">massimo {MAX_KEYWORDS}</span>
            )}
          </p>

          {isRunning ? (
            <button className="btn-ghost text-brand" onClick={onStop}>
              <Square className="h-4 w-4" />
              Ferma e tieni i risultati
            </button>
          ) : (
            <button className="btn-primary" disabled={problems.length > 0} onClick={onStart}>
              <Play className="h-4 w-4" />
              Avvia analisi
            </button>
          )}
        </div>

        {problems.length > 0 && !isRunning && (
          <ul className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {problems.map((problem) => (
              <li key={problem} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {problem}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-5">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Stima prima di partire</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row label="Chiamate SERP" value={String(estimate.serpCalls)} />
            <Row label="Pagine da scaricare" value={String(estimate.pageFetches)} />
            <Row label="Chiamate AI (circa)" value={String(estimate.aiCalls)} />
            <div className="border-t border-surface-border pt-2.5">
              <Row label="Costo indicativo" value={`~ ${estimate.totalUsd.toFixed(2)} $`} strong />
            </div>
          </dl>
          <p className="hint">
            Stima di ordine di grandezza: il costo reale dipende dalle tariffe del tuo piano e dalla
            lunghezza delle pagine analizzate.
          </p>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Avanzamento</h3>
            <span className="text-xs font-medium text-ink-muted">
              {PHASE_LABELS[progress.phase]}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs text-ink-muted">
              <span>
                {progress.completed} / {progress.total} keyword
              </span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {progress.message && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {progress.message}
            </p>
          )}

          {progress.currentKeywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {progress.currentKeywords.map((keyword) => (
                <span key={keyword} className="badge bg-brand-50 text-brand-700">
                  {keyword}
                </span>
              ))}
            </div>
          )}

          {(doneCount > 0 || errorCount > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-4 text-sm">
              <div>
                <p className="text-xl font-semibold text-ink tabular-nums">{doneCount}</p>
                <p className="text-xs text-ink-muted">completate</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums text-brand">{errorCount}</p>
                <p className="text-xs text-ink-muted">in errore</p>
              </div>
            </div>
          )}

          {progress.errors.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-ink-muted hover:text-ink">
                Dettaglio errori ({progress.errors.length})
              </summary>
              <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs">
                {progress.errors.map((error, index) => (
                  <li key={`${error.keyword}-${index}`} className="rounded bg-surface-sunken p-2">
                    <span className="font-medium text-ink">{error.keyword}</span>
                    <span className="mt-0.5 block text-ink-muted">{error.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-base font-semibold text-ink' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
