/**
 * Vista dei risultati: tab tematiche, ognuna con i grafici e le tabelle
 * pertinenti. Tutto quello che appare qui e' calcolato in `lib/analysis`,
 * quindi la modalita' demo usa esattamente gli stessi componenti.
 */
import { useMemo, useState } from 'react'
import {
  Bot,
  Download,
  FileText,
  LayoutGrid,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  Table2,
} from 'lucide-react'
import type { AggregatedAnalysis, AnalysisRun, KeywordResult, PageAudit } from '../../types'
import { ChartCard, EmptyState } from '../charts/ChartCard'
import {
  ClusterTreemap,
  CompetitorHeatmap,
  HorizontalCountChart,
  INTENT_LABELS,
  IntentChart,
  OnPageComparisonChart,
  PositionDistributionChart,
  SeasonalityChart,
  ShareOfVoiceChart,
  VolumeDifficultyScatter,
} from '../charts/Charts'
import { formatDecimal, formatNumber, formatPercent } from '../charts/theme'
import { DataTable, type Column } from './DataTable'
import { StatTiles } from './StatTiles'
import { hasRealVolumes, matchesOwnSite } from '../../lib/analysis/aggregate'
import { BriefPanel } from './BriefPanel'
import type { Credentials } from '../../types'

type TabId = 'panoramica' | 'keyword' | 'opportunita' | 'aio' | 'onpage' | 'cluster' | 'brief'

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'panoramica', label: 'Panoramica', icon: LayoutGrid },
  { id: 'keyword', label: 'Keyword', icon: Table2 },
  { id: 'opportunita', label: 'Opportunita', icon: Lightbulb },
  { id: 'aio', label: 'AI Overview', icon: Bot },
  { id: 'onpage', label: 'On-page', icon: FileText },
  { id: 'cluster', label: 'Cluster e domande', icon: MessageCircleQuestion },
  { id: 'brief', label: 'Content brief', icon: FileText },
]

interface ResultsProps {
  run: AnalysisRun
  credentials: Credentials
  onExport: () => void
  exporting: boolean
  onBriefsChange: (run: AnalysisRun) => void
}

export function Results({ run, credentials, onExport, exporting, onBriefsChange }: ResultsProps) {
  const [tab, setTab] = useState<TabId>('panoramica')
  const aggregate = run.aggregate
  const ownDomain = aggregate?.ownSite?.domain ?? null
  const completed = useMemo(() => run.results.filter((r) => r.status === 'done'), [run.results])

  if (!aggregate || completed.length === 0) {
    return (
      <EmptyState>
        Nessun risultato ancora. Lancia un'analisi dalla tab Analisi, oppure apri la demo dal
        tutorial per vedere come si presenta l'output.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg border border-surface-border bg-surface p-1">
          {TABS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === item.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <button className="btn-primary" onClick={onExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Scarica report Excel
        </button>
      </div>

      {run.isDemo && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
          Stai guardando il dataset dimostrativo: dati realistici ma inventati, utili per capire
          cosa produce l'analisi. Inserisci le tue chiavi e lancia un'analisi vera per sostituirlo.
        </p>
      )}

      {tab === 'panoramica' && <Overview run={run} completed={completed} ownDomain={ownDomain} />}
      {tab === 'keyword' && (
        <KeywordTab
          completed={completed}
          ownDomain={ownDomain}
          intentDistribution={aggregate.intentDistribution}
        />
      )}
      {tab === 'opportunita' && <OpportunityTab run={run} />}
      {tab === 'aio' && <AiOverviewTab run={run} completed={completed} ownDomain={ownDomain} />}
      {tab === 'onpage' && <OnPageTab completed={completed} run={run} ownDomain={ownDomain} />}
      {tab === 'cluster' && <ClusterTab run={run} />}
      {tab === 'brief' && (
        <BriefPanel run={run} credentials={credentials} onBriefsChange={onBriefsChange} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Overview({
  run,
  completed,
  ownDomain,
}: {
  run: AnalysisRun
  completed: KeywordResult[]
  ownDomain: string | null
}) {
  const aggregate = run.aggregate!
  const volumes = hasRealVolumes(completed)

  return (
    <div className="space-y-5">
      <StatTiles aggregate={aggregate} />

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Share of Voice"
          subtitle="Quota del traffico organico stimato sul set di keyword analizzato."
          note={
            volumes
              ? 'Traffico stimato = volume di ricerca x CTR attesa per la posizione occupata.'
              : 'Senza volumi di ricerca la quota pesa solo le posizioni: resta confrontabile fra domini, ma non e traffico reale.'
          }
        >
          <ShareOfVoiceChart
            domains={aggregate.domains}
            ownDomain={ownDomain}
            hasVolumes={volumes}
          />
        </ChartCard>

        <ChartCard
          title={ownDomain ? 'Dove ti posizioni' : 'Distribuzione delle posizioni'}
          subtitle={
            ownDomain
              ? 'Quante volte il tuo dominio compare in ogni fascia di posizione.'
              : 'Distribuzione di tutti i risultati organici raccolti.'
          }
        >
          <PositionDistributionChart results={completed} ownDomain={ownDomain} />
        </ChartCard>
      </div>

      <ChartCard
        title="Chi presidia le tue keyword"
        subtitle="Posizione di ogni competitor su ogni keyword. Piu la cella e scura, migliore e il posizionamento."
      >
        <CompetitorHeatmap results={completed} domains={aggregate.domains} ownDomain={ownDomain} />
      </ChartCard>

      <ChartCard
        title="Tipologia delle pagine che si posizionano"
        subtitle="Ti dice che formato di contenuto premia Google su questo set."
      >
        <HorizontalCountChart
          data={aggregate.pageTypeDistribution.map((item) => ({
            label: item.type,
            value: item.count,
          }))}
          valueLabel="Risultati"
          height={220}
        />
      </ChartCard>
    </div>
  )
}

// ---------------------------------------------------------------------------

function KeywordTab({
  completed,
  ownDomain,
  intentDistribution,
}: {
  completed: KeywordResult[]
  ownDomain: string | null
  intentDistribution: AggregatedAnalysis['intentDistribution']
}) {
  const columns: Column<KeywordResult>[] = [
    {
      key: 'keyword',
      header: 'Keyword',
      value: (r) => r.keyword,
      render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
      width: '22%',
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      value: (r) => r.metrics?.searchVolume ?? null,
      render: (r) => formatNumber(r.metrics?.searchVolume),
    },
    {
      key: 'difficulty',
      header: 'Difficolta',
      align: 'right',
      value: (r) => r.metrics?.difficulty ?? null,
      render: (r) => (r.metrics?.difficulty != null ? String(r.metrics.difficulty) : '-'),
    },
    {
      key: 'cpc',
      header: 'CPC',
      align: 'right',
      value: (r) => r.metrics?.cpc ?? null,
      render: (r) => (r.metrics?.cpc != null ? `${r.metrics.cpc.toFixed(2)} $` : '-'),
    },
    {
      key: 'intent',
      header: 'Intento',
      value: (r) => (r.metrics ? INTENT_LABELS[r.metrics.intent] : null),
    },
    {
      key: 'own',
      header: 'Tua posizione',
      align: 'center',
      value: (r) => r.ownSite.positions[0] ?? null,
      render: (r) =>
        r.ownSite.positions.length > 0 ? (
          <span className="badge bg-brand-50 text-brand-700">#{r.ownSite.positions[0]}</span>
        ) : ownDomain ? (
          <span className="text-ink-faint">assente</span>
        ) : (
          '-'
        ),
    },
    {
      key: 'aio',
      header: 'AI Overview',
      align: 'center',
      value: (r) => (r.serp?.aiOverview.present ? 1 : 0),
      render: (r) => {
        if (r.serp?.aiOverview.unsupported) return <span className="text-ink-faint">n.d.</span>
        if (!r.serp?.aiOverview.present) return <span className="text-ink-faint">no</span>
        return (
          <span className="badge bg-blue-50 text-blue-700">
            {r.serp.aiOverview.sources.length} fonti
            {r.ownSite.inAiOverview ? ' - ci sei' : ''}
          </span>
        )
      },
    },
    {
      key: 'top',
      header: 'Primo risultato',
      value: (r) => r.serp?.organic[0]?.domain ?? null,
      render: (r) => {
        const first = r.serp?.organic[0]
        if (!first) return '-'
        return (
          <a
            className="text-brand hover:underline"
            href={first.link}
            target="_blank"
            rel="noreferrer"
          >
            {first.domain}
          </a>
        )
      },
    },
    {
      key: 'features',
      header: 'Feature SERP',
      value: (r) => r.serp?.serpFeatures.join(', ') ?? null,
      render: (r) => (
        <span className="text-ink-faint">{r.serp?.serpFeatures.slice(0, 3).join(', ') || '-'}</span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Volume contro difficolta"
          subtitle="In alto a sinistra le occasioni migliori: molto volume, poca concorrenza. La dimensione della bolla e il volume."
          note="In rosso le keyword dove sei gia posizionato, in blu quelle scoperte. L'intento e nel tooltip: quattro colori distinti non sarebbero leggibili da chi ha un deficit di visione dei colori."
        >
          <VolumeDifficultyScatter results={completed} />
        </ChartCard>

        <ChartCard
          title="Intento di ricerca"
          subtitle="Che tipo di risposta si aspetta chi cerca queste keyword."
        >
          <IntentChart data={intentDistribution} />
        </ChartCard>
      </div>

      <ChartCard
        title="Stagionalita del topic"
        subtitle="Somma dei volumi mese per mese: dice quando conviene pubblicare."
      >
        <SeasonalityChart results={completed} />
      </ChartCard>

      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Dettaglio per keyword</h3>
        <DataTable rows={completed} columns={columns} rowKey={(r) => r.keyword} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function OpportunityTab({ run }: { run: AnalysisRun }) {
  const aggregate = run.aggregate!

  if (!aggregate.ownSite) {
    return (
      <EmptyState>
        Content gap e cannibalizzazione hanno senso solo rispetto a un sito: imposta il tuo dominio
        nella configurazione e rilancia l'analisi.
      </EmptyState>
    )
  }

  const gapColumns: Column<(typeof aggregate.contentGap)[number]>[] = [
    {
      key: 'keyword',
      header: 'Keyword',
      value: (r) => r.keyword,
      render: (r) => <span className="font-medium text-ink">{r.keyword}</span>,
      width: '24%',
    },
    {
      key: 'opportunity',
      header: 'Opportunita',
      align: 'right',
      value: (r) => r.opportunityScore,
      render: (r) => (
        <span className="font-semibold text-brand">{formatDecimal(r.opportunityScore)}</span>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      value: (r) => r.searchVolume,
      render: (r) => formatNumber(r.searchVolume),
    },
    { key: 'difficulty', header: 'Difficolta', align: 'right', value: (r) => r.difficulty },
    { key: 'intent', header: 'Intento', value: (r) => INTENT_LABELS[r.intent] },
    {
      key: 'own',
      header: 'Tua posizione',
      align: 'center',
      value: (r) => r.ownPosition,
      render: (r) =>
        r.ownPosition ? `#${r.ownPosition}` : <span className="text-ink-faint">assente</span>,
    },
    {
      key: 'competitors',
      header: 'Competitor in top 10',
      value: (r) => r.competitorsInTop10,
      render: (r) => (
        <span>
          <span className="font-medium text-ink">{r.competitorsInTop10}</span>
          <span className="ml-2 text-ink-faint">{r.competitorDomains.slice(0, 3).join(', ')}</span>
        </span>
      ),
    },
  ]

  const cannibalColumns: Column<(typeof aggregate.cannibalization)[number]>[] = [
    {
      key: 'type',
      header: 'Tipo',
      value: (r) => r.type,
      render: (r) => (
        <span className="badge bg-amber-50 text-amber-800">
          {r.type === 'stessa-keyword' ? 'Piu pagine, stessa query' : 'Una pagina, piu intenti'}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Oggetto',
      value: (r) => r.keyword ?? r.url ?? '',
      render: (r) =>
        r.keyword ? (
          <span className="font-medium text-ink">{r.keyword}</span>
        ) : (
          <a className="text-brand hover:underline" href={r.url} target="_blank" rel="noreferrer">
            {r.url}
          </a>
        ),
      width: '26%',
    },
    {
      key: 'detail',
      header: 'Dettaglio',
      value: (r) => r.urls.join(' '),
      render: (r) => (
        <div className="space-y-1">
          {r.type === 'stessa-keyword'
            ? r.urls.map((url, index) => (
                <div key={url}>
                  <a
                    className="text-brand hover:underline"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {url}
                  </a>
                  {r.positions[index] != null && (
                    <span className="ml-2 text-ink-faint">#{r.positions[index]}</span>
                  )}
                </div>
              ))
            : r.keywords.map((keyword) => <div key={keyword}>{keyword}</div>)}
        </div>
      ),
    },
    { key: 'note', header: 'Cosa significa', value: (r) => r.note },
  ]

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h3 className="text-sm font-semibold text-ink">Content gap</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Keyword presidiate da almeno due competitor dove tu manchi o sei sotto la terza posizione.
          Il punteggio di opportunita combina volume, guadagno di CTR possibile e difficolta.
        </p>
        <div className="mt-4">
          <DataTable
            rows={aggregate.contentGap}
            columns={gapColumns}
            rowKey={(r) => r.keyword}
            emptyMessage="Nessun gap rilevato: sei presente su tutte le keyword presidiate dai competitor."
          />
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-sm font-semibold text-ink">Cannibalizzazione</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Due situazioni distinte: piu tue pagine che competono sulla stessa query, e una sola
          pagina che intercetta intenti appartenenti a cluster diversi.
        </p>
        <div className="mt-4">
          <DataTable
            rows={aggregate.cannibalization}
            columns={cannibalColumns}
            rowKey={(r, index) => `${r.type}-${r.keyword ?? r.url}-${index}`}
            emptyMessage="Nessuna sovrapposizione rilevata fra le tue pagine."
          />
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AiOverviewTab({
  run,
  completed,
  ownDomain,
}: {
  run: AnalysisRun
  completed: KeywordResult[]
  ownDomain: string | null
}) {
  const aggregate = run.aggregate!
  const [selected, setSelected] = useState<string | null>(null)

  if (!aggregate.aiOverview.supported) {
    return (
      <EmptyState>
        <div className="max-w-md space-y-2">
          <p className="font-medium text-ink">AI Overview non disponibile con questo provider</p>
          <p>
            Serper restituisce organici, People also ask e ricerche correlate, ma non l'AI Overview
            in forma strutturata. Per rilevarlo, leggerne il testo e sapere quali fonti cita, scegli
            DataForSEO nella configurazione e rilancia l'analisi.
          </p>
        </div>
      </EmptyState>
    )
  }

  const withAio = completed.filter((r) => r.serp?.aiOverview.present)
  const current = withAio.find((r) => r.keyword === selected) ?? withAio[0]
  const analyses = completed.flatMap((r) => r.aiPageAnalyses)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Domini piu citati dall'AI Overview"
          subtitle="Chi Google usa come fonte quando genera la risposta."
        >
          <HorizontalCountChart
            data={aggregate.aiOverview.topCitedDomains.map((item) => ({
              label: item.domain,
              value: item.citations,
            }))}
            ownDomain={ownDomain}
            valueLabel="Citazioni"
          />
        </ChartCard>

        <ChartCard
          title="Copertura dell'AI Overview"
          subtitle="Su quante keyword del set compare la risposta generata."
        >
          <div className="flex h-full flex-col justify-center gap-4 py-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums text-ink">
                {formatPercent(
                  aggregate.aiOverview.keywordsTotal > 0
                    ? aggregate.aiOverview.keywordsWithAio / aggregate.aiOverview.keywordsTotal
                    : 0,
                  0,
                )}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {aggregate.aiOverview.keywordsWithAio} keyword su{' '}
                {aggregate.aiOverview.keywordsTotal} mostrano l'AI Overview
              </p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-[#2a78d6]"
                style={{
                  width: `${
                    aggregate.aiOverview.keywordsTotal > 0
                      ? (aggregate.aiOverview.keywordsWithAio /
                          aggregate.aiOverview.keywordsTotal) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>
            {ownDomain && (
              <p className="text-sm text-ink-muted">
                Il tuo sito e citato in{' '}
                <span className="font-semibold text-brand">
                  {aggregate.aiOverview.ownSiteCitations}
                </span>{' '}
                di queste.
              </p>
            )}
          </div>
        </ChartCard>
      </div>

      {withAio.length > 0 && current && (
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Contenuto e fonti</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {withAio.map((result) => (
              <button
                key={result.keyword}
                onClick={() => setSelected(result.keyword)}
                className={`badge transition-colors ${
                  current.keyword === result.keyword
                    ? 'bg-brand text-white'
                    : 'bg-surface-sunken text-ink-muted hover:bg-surface-border'
                }`}
              >
                {result.keyword}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Testo generato da Google
              </p>
              <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-4 text-xs leading-relaxed text-ink-muted">
                {current.serp?.aiOverview.text || 'Testo non disponibile per questa keyword.'}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Fonti citate ({current.serp?.aiOverview.sources.length ?? 0})
              </p>
              <ol className="mt-2 space-y-2">
                {current.serp?.aiOverview.sources.map((source) => {
                  const isOwn = ownDomain ? matchesOwnSite(source.domain, ownDomain) : false
                  return (
                    <li
                      key={`${source.link}-${source.position}`}
                      className={`rounded-lg border p-3 text-xs ${
                        isOwn ? 'border-brand-200 bg-brand-50' : 'border-surface-border'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-semibold text-ink-muted">
                          {source.position}
                        </span>
                        <span>
                          <a
                            className="font-medium text-brand hover:underline"
                            href={source.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.title || source.link}
                          </a>
                          <span className="mt-0.5 block text-ink-faint">{source.domain}</span>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        </section>
      )}

      {analyses.length > 0 && (
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Perche quelle pagine vengono citate</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Analisi generata dal modello sulle pagine effettivamente citate.
          </p>
          <div className="mt-4 space-y-3">
            {analyses.map((analysis, index) => (
              <details
                key={`${analysis.url}-${index}`}
                className="rounded-lg border border-surface-border p-3"
              >
                <summary className="cursor-pointer text-xs">
                  <span className="font-medium text-ink">{analysis.keyword}</span>
                  <span className="ml-2 text-ink-faint">
                    {analysis.domain} - posizione {analysis.positionInAi} nelle fonti
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-xs leading-relaxed text-ink-muted">
                  <a
                    className="block text-brand hover:underline"
                    href={analysis.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {analysis.url}
                  </a>
                  {analysis.schemaTypes && (
                    <p className="text-ink-faint">Dati strutturati: {analysis.schemaTypes}</p>
                  )}
                  <p className="whitespace-pre-wrap">{analysis.analysis}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function OnPageTab({
  completed,
  run,
  ownDomain,
}: {
  completed: KeywordResult[]
  run: AnalysisRun
  ownDomain: string | null
}) {
  const aggregate = run.aggregate!
  const audits = useMemo(
    () =>
      completed.flatMap((result) =>
        result.audits.map((audit) => ({ ...audit, keyword: result.keyword })),
      ),
    [completed],
  )
  const okAudits = audits.filter((a) => a.ok)

  const ownAudits = ownDomain
    ? okAudits.filter((audit) => matchesOwnSite(audit.domain, ownDomain))
    : []
  const competitorAudits = ownDomain
    ? okAudits.filter((audit) => !matchesOwnSite(audit.domain, ownDomain))
    : okAudits

  const average = (items: PageAudit[], pick: (a: PageAudit) => number) =>
    items.length > 0 ? Math.round(items.reduce((sum, a) => sum + pick(a), 0) / items.length) : 0

  const comparison = {
    own:
      ownAudits.length > 0
        ? {
            wordCount: average(ownAudits, (a) => a.wordCount),
            titleLength: average(ownAudits, (a) => a.titleLength),
            h2: average(ownAudits, (a) => a.h2.length),
            schemaTypes: average(ownAudits, (a) => a.schemaTypes.length),
          }
        : null,
    competitors: {
      wordCount: average(competitorAudits, (a) => a.wordCount),
      titleLength: average(competitorAudits, (a) => a.titleLength),
      h2: average(competitorAudits, (a) => a.h2.length),
      schemaTypes: average(competitorAudits, (a) => a.schemaTypes.length),
    },
  }

  const columns: Column<(typeof audits)[number]>[] = [
    { key: 'keyword', header: 'Keyword', value: (r) => r.keyword, width: '14%' },
    {
      key: 'url',
      header: 'URL',
      value: (r) => r.url,
      render: (r) => (
        <a
          className={`hover:underline ${
            ownDomain && matchesOwnSite(r.domain, ownDomain)
              ? 'font-semibold text-brand'
              : 'text-ink-muted'
          }`}
          href={r.url}
          target="_blank"
          rel="noreferrer"
        >
          {r.url.length > 60 ? `${r.url.slice(0, 59)}...` : r.url}
        </a>
      ),
      width: '24%',
    },
    {
      key: 'status',
      header: 'Stato',
      align: 'center',
      value: (r) => (r.ok ? r.statusCode : 0),
      render: (r) =>
        r.ok ? (
          <span className="badge bg-emerald-50 text-emerald-700">{r.statusCode}</span>
        ) : (
          <span className="badge bg-amber-50 text-amber-800" title={r.error}>
            errore
          </span>
        ),
    },
    {
      key: 'title',
      header: 'Title',
      value: (r) => r.titleLength,
      align: 'right',
      render: (r) => `${r.titleLength}`,
    },
    {
      key: 'meta',
      header: 'Meta desc',
      value: (r) => r.metaDescriptionLength,
      align: 'right',
      render: (r) => `${r.metaDescriptionLength}`,
    },
    {
      key: 'words',
      header: 'Parole',
      value: (r) => r.wordCount,
      align: 'right',
      render: (r) => formatNumber(r.wordCount),
    },
    { key: 'h2', header: 'H2', value: (r) => r.h2.length, align: 'right' },
    {
      key: 'links',
      header: 'Link int./est.',
      value: (r) => r.internalLinks,
      align: 'right',
      render: (r) => `${r.internalLinks} / ${r.externalLinks}`,
    },
    {
      key: 'alt',
      header: 'Img senza alt',
      align: 'right',
      value: (r) => r.imagesWithoutAlt,
      render: (r) => `${r.imagesWithoutAlt} / ${r.images}`,
    },
    {
      key: 'schema',
      header: 'Dati strutturati',
      value: (r) => r.schemaTypes.join(', '),
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.hasFaq && <span className="badge bg-blue-50 text-blue-700">FAQ</span>}
          {r.hasBreadcrumbs && <span className="badge bg-blue-50 text-blue-700">Breadcrumb</span>}
          {r.hasReview && <span className="badge bg-blue-50 text-blue-700">Review</span>}
          {r.schemaTypes.length === 0 && <span className="text-ink-faint">nessuno</span>}
        </span>
      ),
    },
  ]

  const vitals = completed.flatMap((r) => r.vitals)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Le tue pagine contro i top risultati"
          subtitle="Medie a confronto: dove sei sotto, c'e' margine di intervento."
        >
          <OnPageComparisonChart own={comparison.own} competitors={comparison.competitors} />
        </ChartCard>

        <ChartCard
          title="Dati strutturati usati dai competitor"
          subtitle="Gli schema piu ricorrenti fra le pagine che si posizionano."
        >
          <HorizontalCountChart
            data={aggregate.schemaTypes.slice(0, 12).map((item) => ({
              label: item.type,
              value: item.count,
            }))}
            valueLabel="Pagine"
          />
        </ChartCard>
      </div>

      {vitals.length > 0 && (
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Core Web Vitals delle tue pagine</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vitals.map((v) => (
              <div key={v.url} className="rounded-lg border border-surface-border p-3 text-xs">
                <a
                  className="block truncate font-medium text-brand hover:underline"
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {v.url}
                </a>
                {v.ok ? (
                  <dl className="mt-2 space-y-1 text-ink-muted">
                    <div className="flex justify-between">
                      <dt>Performance</dt>
                      <dd className="tabular-nums font-medium text-ink">
                        {v.performanceScore ?? '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>LCP</dt>
                      <dd className="tabular-nums">
                        {v.lcp != null ? `${(v.lcp / 1000).toFixed(2)} s` : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>CLS</dt>
                      <dd className="tabular-nums">{v.cls != null ? v.cls.toFixed(3) : '-'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>INP</dt>
                      <dd className="tabular-nums">{v.inp != null ? `${v.inp} ms` : '-'}</dd>
                    </div>
                    <p className="pt-1 text-ink-faint">
                      {v.fieldData ? 'Dati di utenti reali (CrUX)' : 'Dati di laboratorio'}
                    </p>
                  </dl>
                ) : (
                  <p className="mt-2 text-ink-faint">{v.error}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Audit pagina per pagina</h3>
        <DataTable rows={audits} columns={columns} rowKey={(r, i) => `${r.url}-${i}`} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ClusterTab({ run }: { run: AnalysisRun }) {
  const aggregate = run.aggregate!

  return (
    <div className="space-y-5">
      <ChartCard
        title="Cluster di keyword"
        subtitle="Come si raggruppano le keyword. I cluster che hai definito tu hanno la precedenza."
      >
        <ClusterTreemap clusters={aggregate.clusters} />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">People also ask</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Le domande che Google associa a queste keyword: materiale diretto per FAQ e paragrafi.
          </p>
          <div className="mt-4">
            <DataTable
              rows={aggregate.paa}
              columns={[
                { key: 'question', header: 'Domanda', value: (r) => r.question, width: '65%' },
                {
                  key: 'keywords',
                  header: 'Da quali keyword',
                  value: (r) => r.keywords.length,
                  align: 'right',
                  render: (r) => <span title={r.keywords.join(', ')}>{r.keywords.length}</span>,
                },
              ]}
              rowKey={(r) => r.question}
              emptyMessage="Nessuna domanda correlata rilevata."
              pageSize={25}
            />
          </div>
        </section>

        <section className="card p-5">
          <h3 className="text-sm font-semibold text-ink">Ricerche correlate</h3>
          <p className="mt-1 text-xs text-ink-muted">
            Espansioni di query utili per ampliare il set di keyword.
          </p>
          <div className="mt-4">
            <DataTable
              rows={aggregate.related}
              columns={[
                { key: 'query', header: 'Query', value: (r) => r.query, width: '65%' },
                {
                  key: 'keywords',
                  header: 'Da quali keyword',
                  value: (r) => r.keywords.length,
                  align: 'right',
                  render: (r) => <span title={r.keywords.join(', ')}>{r.keywords.length}</span>,
                },
              ]}
              rowKey={(r) => r.query}
              emptyMessage="Nessuna ricerca correlata rilevata."
              pageSize={25}
            />
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-ink">Keyword per cluster</h3>
        <DataTable
          rows={aggregate.clusters}
          columns={[
            {
              key: 'name',
              header: 'Cluster',
              value: (r) => r.name,
              render: (r) => (
                <span className="font-medium text-ink">
                  {r.isCustom && <span className="mr-1 text-brand">&#9679;</span>}
                  {r.name}
                </span>
              ),
              width: '22%',
            },
            { key: 'count', header: 'Keyword', align: 'right', value: (r) => r.keywords.length },
            {
              key: 'volume',
              header: 'Volume totale',
              align: 'right',
              value: (r) => r.totalVolume,
              render: (r) => formatNumber(r.totalVolume),
            },
            {
              key: 'keywords',
              header: 'Elenco',
              value: (r) => r.keywords.join(', '),
              render: (r) => <span className="text-ink-faint">{r.keywords.join(', ')}</span>,
            },
          ]}
          rowKey={(r) => r.name}
          emptyMessage="Clustering non attivo o nessun cluster generato."
        />
      </section>
    </div>
  )
}
