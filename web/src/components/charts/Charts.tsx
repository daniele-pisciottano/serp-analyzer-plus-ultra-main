/**
 * Grafici dell'analisi.
 *
 * Convenzione di colore uniforme in tutta l'app: blu = mercato / competitor,
 * rosso = il tuo sito. Ogni grafico ha etichette diretta sui valori quando le
 * barre sono poche, cosi' il colore non e' mai l'unico canale informativo.
 */
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
} from 'recharts'
import type { AggregatedAnalysis, KeywordResult, SearchIntent } from '../../types'
import {
  AXIS_PROPS,
  CHART,
  GRID_PROPS,
  formatDecimal,
  formatNumber,
  formatPercent,
  positionColor,
  positionTextColor,
} from './theme'
import { EmptyState } from './ChartCard'
import { ChartFrame } from './ChartFrame'

const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid #E3E8EF',
    boxShadow: '0 4px 16px rgba(20, 23, 31, 0.08)',
    fontSize: 12,
  },
  labelStyle: { color: CHART.ink, fontWeight: 600, marginBottom: 4 },
}

function truncateLabel(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value
}

// ---------------------------------------------------------------------------

interface ShareOfVoiceProps {
  domains: AggregatedAnalysis['domains']
  ownDomain: string | null
  hasVolumes: boolean
}

export function ShareOfVoiceChart({ domains, ownDomain, hasVolumes }: ShareOfVoiceProps) {
  const visible = domains.filter((d) => d.estimatedTraffic > 0).slice(0, 12)

  // Ai grafici passiamo solo i campi che disegnano: Recharts include ogni campo
  // numerico del dataset nel dominio dell'asse, e un "traffico" nell'ordine
  // delle migliaia schiaccerebbe barre che valgono frazioni di unita'.
  const data = visible.map((d) => ({
    domain: truncateLabel(d.domain, 26),
    fullDomain: d.domain,
    sov: d.shareOfVoice,
    isOwn: ownDomain ? d.domain === ownDomain : false,
  }))
  const extras = new Map(
    visible.map((d) => [
      d.domain,
      { traffic: Math.round(d.estimatedTraffic), keywords: d.keywords.length },
    ]),
  )

  if (data.length === 0) {
    return <EmptyState>Nessun dominio con traffico stimato: servono risultati organici.</EmptyState>
  }

  return (
    <ChartFrame height={Math.max(240, data.length * 30)}>
      {({ width, height: frameHeight }) => (
        <BarChart
          width={width}
          height={frameHeight}
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v: number) => formatPercent(v, 0)} />
          <YAxis type="category" dataKey="domain" width={170} {...AXIS_PROPS} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number, _name, item) => [
              `${formatPercent(value)} - traffico stimato ${formatNumber(
                extras.get(item.payload.fullDomain)?.traffic,
              )}${hasVolumes ? '/mese' : ' (peso posizionale)'}`,
              'Share of Voice',
            ]}
            labelFormatter={(_l, payload) => payload?.[0]?.payload.fullDomain ?? ''}
          />
          <Bar dataKey="sov" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.fullDomain} fill={entry.isOwn ? CHART.own : CHART.series} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

export function PositionDistributionChart({
  results,
  ownDomain,
}: {
  results: KeywordResult[]
  ownDomain: string | null
}) {
  const buckets = [
    { label: '1', min: 1, max: 1 },
    { label: '2-3', min: 2, max: 3 },
    { label: '4-5', min: 4, max: 5 },
    { label: '6-10', min: 6, max: 10 },
    { label: '11-20', min: 11, max: 20 },
  ]

  const positions = ownDomain
    ? results.flatMap((r) => r.ownSite.positions)
    : results.flatMap((r) => r.serp?.organic.map((o) => o.position) ?? [])

  const data = buckets.map((bucket) => ({
    label: bucket.label,
    count: positions.filter((p) => p >= bucket.min && p <= bucket.max).length,
  }))

  if (positions.length === 0) {
    return (
      <EmptyState>
        {ownDomain
          ? 'Il tuo dominio non compare in nessuna delle SERP analizzate.'
          : 'Nessuna posizione da mostrare.'}
      </EmptyState>
    )
  }

  return (
    <ChartFrame height={240}>
      {({ width, height: frameHeight }) => (
        <BarChart
          width={width}
          height={frameHeight}
          data={data}
          margin={{ top: 16, right: 8, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v} keyword`, 'Conteggio']} />
          <Bar
            isAnimationActive={false}
            dataKey="count"
            fill={ownDomain ? CHART.own : CHART.series}
            radius={[4, 4, 0, 0]}
            barSize={44}
            label={{ position: 'top', fontSize: 12, fill: CHART.inkMuted }}
          />
        </BarChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

/**
 * Volume x difficolta'. L'intento non e' codificato con il colore: quattro
 * categorie non supererebbero le soglie per i deficit di visione dei colori su
 * uno scatter, quindi vive nel tooltip e ha un grafico dedicato.
 */
export function VolumeDifficultyScatter({ results }: { results: KeywordResult[] }) {
  // `position` resta una stringa: se fosse numerica entrerebbe nel dominio
  // degli assi, che qui sono vincolati a volume e difficolta'.
  const data = results
    .filter((r) => r.metrics?.searchVolume != null && r.metrics.difficulty != null)
    .map((r) => ({
      keyword: r.keyword,
      volume: r.metrics!.searchVolume!,
      difficulty: r.metrics!.difficulty!,
      intent: r.metrics!.intent,
      positionLabel: r.ownSite.positions[0] ? `#${r.ownSite.positions[0]}` : 'non posizionata',
      ranked: r.ownSite.positions.length > 0,
      z: Math.max(r.metrics!.searchVolume!, 1),
    }))

  if (data.length === 0) {
    return (
      <EmptyState>
        Servono volume e difficolta': attiva le metriche keyword e inserisci le credenziali
        DataForSEO.
      </EmptyState>
    )
  }

  return (
    <ChartFrame height={320}>
      {({ width, height: frameHeight }) => (
        <ScatterChart
          width={width}
          height={frameHeight}
          margin={{ top: 12, right: 16, bottom: 24, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} vertical />
          <XAxis
            type="number"
            dataKey="difficulty"
            name="Difficolta"
            domain={[0, 100]}
            {...AXIS_PROPS}
            label={{
              value: 'Keyword difficulty',
              position: 'insideBottom',
              offset: -14,
              fontSize: 12,
              fill: CHART.inkMuted,
            }}
          />
          <YAxis
            type="number"
            dataKey="volume"
            name="Volume"
            {...AXIS_PROPS}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <ZAxis type="number" dataKey="z" range={[60, 420]} />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(value: number, name: string) => [formatNumber(value), name]}
            labelFormatter={() => ''}
            content={({ payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!point) return null
              return (
                <div className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs shadow-card">
                  <p className="font-semibold text-ink">{point.keyword}</p>
                  <p className="text-ink-muted mt-1">Volume: {formatNumber(point.volume)}/mese</p>
                  <p className="text-ink-muted">Difficolta: {point.difficulty}</p>
                  <p className="text-ink-muted">Intento: {INTENT_LABELS[point.intent]}</p>
                  <p className="text-ink-muted">Tua posizione: {point.positionLabel}</p>
                </div>
              )
            }}
          />
          <Scatter data={data} fill={CHART.series} fillOpacity={0.65} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.keyword} fill={entry.ranked ? CHART.own : CHART.series} />
            ))}
          </Scatter>
        </ScatterChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

export const INTENT_LABELS: Record<SearchIntent, string> = {
  informational: 'Informazionale',
  navigational: 'Navigazionale',
  commercial: 'Commerciale',
  transactional: 'Transazionale',
  unknown: 'Non determinato',
}

export function IntentChart({ data }: { data: AggregatedAnalysis['intentDistribution'] }) {
  // `volume` resta fuori dal dataset del grafico: e' ordini di grandezza sopra
  // `count` e finirebbe nel dominio dell'asse, appiattendo le barre.
  const chartData = data.map((item) => ({
    label: INTENT_LABELS[item.intent],
    count: item.count,
  }))
  const volumeByLabel = new Map(data.map((item) => [INTENT_LABELS[item.intent], item.volume]))

  if (chartData.length === 0) {
    return <EmptyState>Nessun dato sull'intento di ricerca.</EmptyState>
  }

  return (
    <ChartFrame height={Math.max(200, chartData.length * 44)}>
      {({ width, height: frameHeight }) => (
        <BarChart
          width={width}
          height={frameHeight}
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={140} {...AXIS_PROPS} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number, _n, item) => [
              `${value} keyword - ${formatNumber(volumeByLabel.get(item.payload.label))} ricerche/mese`,
              'Totale',
            ]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="count"
            fill={CHART.series}
            radius={[0, 4, 4, 0]}
            barSize={18}
            label={{ position: 'right', fontSize: 12, fill: CHART.inkMuted }}
          />
        </BarChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

export function HorizontalCountChart({
  data,
  ownDomain,
  valueLabel,
  height,
}: {
  data: { label: string; value: number }[]
  ownDomain?: string | null
  valueLabel: string
  height?: number
}) {
  if (data.length === 0) return <EmptyState>Nessun dato disponibile.</EmptyState>

  const chartData = data.map((item) => ({
    ...item,
    short: truncateLabel(item.label, 30),
    isOwn: ownDomain ? item.label === ownDomain : false,
  }))

  return (
    <ChartFrame height={height ?? Math.max(200, chartData.length * 28)}>
      {({ width, height: frameHeight }) => (
        <BarChart
          width={width}
          height={frameHeight}
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="short" width={190} {...AXIS_PROPS} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number) => [formatNumber(value), valueLabel]}
            labelFormatter={(_l, payload) => payload?.[0]?.payload.label ?? ''}
          />
          <Bar
            isAnimationActive={false}
            dataKey="value"
            radius={[0, 4, 4, 0]}
            barSize={14}
            label={{ position: 'right', fontSize: 11, fill: CHART.inkMuted }}
          >
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={entry.isOwn ? CHART.own : CHART.series} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

/** Andamento a 12 mesi di una keyword. Serie singola, quindi nessuna legenda. */
export function SeasonalityChart({ results }: { results: KeywordResult[] }) {
  const withTrend = results.filter((r) => (r.metrics?.monthlySearches.length ?? 0) > 0)
  if (withTrend.length === 0) {
    return <EmptyState>Nessun dato di stagionalita' disponibile.</EmptyState>
  }

  // Somma dei volumi mese per mese: descrive la stagionalita' del topic nel suo insieme
  const totals = new Map<string, { label: string; volume: number; order: number }>()
  for (const result of withTrend) {
    for (const month of result.metrics!.monthlySearches) {
      const key = `${month.year}-${String(month.month).padStart(2, '0')}`
      const entry = totals.get(key) ?? {
        label: `${String(month.month).padStart(2, '0')}/${String(month.year).slice(2)}`,
        volume: 0,
        order: month.year * 12 + month.month,
      }
      entry.volume += month.searchVolume
      totals.set(key, entry)
    }
  }

  // `order` serve solo a ordinare: se restasse nel dataset entrerebbe nel
  // dominio dell'asse Y (vale decine di migliaia) e la linea diventerebbe piatta.
  const data = [...totals.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ label, volume }) => ({ label, volume }))

  return (
    <ChartFrame height={240}>
      {({ width, height: frameHeight }) => (
        <LineChart
          width={width}
          height={frameHeight}
          data={data}
          margin={{ top: 12, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: number) => [`${formatNumber(value)} ricerche`, 'Volume totale']}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="volume"
            stroke={CHART.series}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART.series, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      )}
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------

/**
 * Heatmap keyword x competitor. Non e' un grafico Recharts ma una tabella:
 * i valori sono etichettati, quindi il colore rafforza la lettura invece di
 * esserne l'unico veicolo.
 */
export function CompetitorHeatmap({
  results,
  domains,
  ownDomain,
}: {
  results: KeywordResult[]
  domains: AggregatedAnalysis['domains']
  ownDomain: string | null
}) {
  const topDomains = domains
    .filter((d) => d.occurrences > 0)
    .slice(0, 8)
    .map((d) => d.domain)

  const rows = results
    .filter((r) => r.status === 'done' && r.serp)
    .slice(0, 40)
    .map((result) => ({
      keyword: result.keyword,
      cells: topDomains.map((domain) => {
        const hit = result.serp!.organic.find((item) => item.domain === domain)
        return { domain, position: hit?.position ?? null }
      }),
    }))

  if (rows.length === 0 || topDomains.length === 0) {
    return <EmptyState>Servono almeno una keyword completata e un competitor.</EmptyState>
  }

  return (
    <div className="scroll-x">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-ink">
              Keyword
            </th>
            {topDomains.map((domain) => (
              <th
                key={domain}
                className="px-2 py-2 text-center font-medium"
                style={{ color: domain === ownDomain ? CHART.own : CHART.inkMuted }}
              >
                <span className="block max-w-[110px] truncate" title={domain}>
                  {domain}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keyword}>
              <td className="sticky left-0 z-10 max-w-[220px] truncate bg-surface px-3 py-1.5 text-ink">
                {row.keyword}
              </td>
              {row.cells.map((cell) => (
                <td key={cell.domain} className="px-1 py-1 text-center">
                  <span
                    className="inline-flex h-7 w-full min-w-[44px] items-center justify-center rounded font-semibold tabular-nums"
                    style={{
                      backgroundColor: cell.position ? positionColor(cell.position) : '#F5F7FA',
                      color: cell.position ? positionTextColor(cell.position) : '#C3C9D3',
                      outline:
                        cell.domain === ownDomain && cell.position
                          ? `2px solid ${CHART.own}`
                          : undefined,
                      outlineOffset: '-2px',
                    }}
                    title={
                      cell.position
                        ? `${cell.domain} in posizione ${cell.position} per "${row.keyword}"`
                        : `${cell.domain} non presente per "${row.keyword}"`
                    }
                  >
                    {cell.position ?? '-'}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-faint">
        Il numero e' la posizione organica; piu' e' scura la cella, migliore e' il posizionamento.
        Le celle vuote indicano assenza dalla top {results[0]?.serp?.organic.length ?? 10}.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Treemap dei cluster: l'area e' proporzionale al volume, o al numero di keyword. */
export function ClusterTreemap({ clusters }: { clusters: AggregatedAnalysis['clusters'] }) {
  const useVolume = clusters.some((c) => c.totalVolume > 0)
  const items = clusters
    .map((cluster) => ({
      name: cluster.name,
      value: useVolume ? cluster.totalVolume : cluster.keywords.length,
      keywords: cluster.keywords.length,
      isCustom: cluster.isCustom,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 18)

  if (items.length === 0) return <EmptyState>Nessun cluster generato.</EmptyState>

  const total = items.reduce((sum, item) => sum + item.value, 0)
  const max = items[0].value

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const share = item.value / total
        const intensity = Math.round((item.value / max) * (BLUE_STEPS.length - 1))
        return (
          <div key={item.name} className="flex items-center gap-3">
            <span className="w-44 shrink-0 truncate text-xs text-ink" title={item.name}>
              {item.isCustom && (
                <span className="mr-1 text-brand" title="Cluster definito da te">
                  &#9679;
                </span>
              )}
              {item.name}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-surface-sunken">
              <div
                className="flex h-full items-center justify-end rounded px-2 text-[11px] font-semibold tabular-nums"
                style={{
                  width: `${Math.max(share * 100, 4)}%`,
                  backgroundColor: BLUE_STEPS[intensity],
                  color: intensity > 5 ? '#FFFFFF' : CHART.ink,
                }}
              >
                {useVolume ? formatNumber(item.value) : item.value}
              </div>
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-ink-faint">
              {item.keywords} kw
            </span>
          </div>
        )
      })}
      <p className="pt-1 text-xs text-ink-faint">
        {useVolume
          ? 'La barra e proporzionale al volume di ricerca complessivo del cluster.'
          : 'Senza metriche keyword la barra usa il numero di keyword del cluster.'}
        {clusters.some((c) => c.isCustom) &&
          ' Il pallino rosso indica i cluster che hai definito tu.'}
      </p>
    </div>
  )
}

const BLUE_STEPS = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
]

// ---------------------------------------------------------------------------

/** Confronto della tua pagina con la media dei top risultati. */
export function OnPageComparisonChart({
  own,
  competitors,
}: {
  own: { wordCount: number; titleLength: number; h2: number; schemaTypes: number } | null
  competitors: { wordCount: number; titleLength: number; h2: number; schemaTypes: number }
}) {
  if (!own) {
    return (
      <EmptyState>
        Nessuna tua pagina fra i risultati analizzati: imposta il dominio e rilancia l'analisi.
      </EmptyState>
    )
  }

  const metrics = [
    { label: 'Parole', own: own.wordCount, avg: competitors.wordCount },
    { label: 'Caratteri title', own: own.titleLength, avg: competitors.titleLength },
    { label: 'Heading H2', own: own.h2, avg: competitors.h2 },
    { label: 'Tipi di schema', own: own.schemaTypes, avg: competitors.schemaTypes },
  ]

  return (
    <ChartFrame height={260}>
      {({ width, height: frameHeight }) => (
        <BarChart
          width={width}
          height={frameHeight}
          data={metrics}
          margin={{ top: 16, right: 8, bottom: 4, left: 8 }}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => formatNumber(value)} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: CHART.inkMuted }}>{value}</span>}
          />
          <Bar
            isAnimationActive={false}
            dataKey="avg"
            name="Media top risultati"
            fill={CHART.series}
            radius={[4, 4, 0, 0]}
            barSize={26}
          />
          <Bar
            isAnimationActive={false}
            dataKey="own"
            name="La tua pagina"
            fill={CHART.own}
            radius={[4, 4, 0, 0]}
            barSize={26}
          />
        </BarChart>
      )}
    </ChartFrame>
  )
}

export { formatNumber, formatPercent, formatDecimal }
