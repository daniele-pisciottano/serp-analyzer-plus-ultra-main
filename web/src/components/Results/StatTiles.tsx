import type { ReactNode } from 'react'
import type { AggregatedAnalysis } from '../../types'
import { formatNumber, formatPercent } from '../charts/theme'

function Tile({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${accent ? 'text-brand' : 'text-ink'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  )
}

export function StatTiles({ aggregate }: { aggregate: AggregatedAnalysis }) {
  const { totals, aiOverview, ownSite } = aggregate

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Keyword analizzate"
        value={formatNumber(totals.completed)}
        hint={totals.failed > 0 ? `${totals.failed} non recuperate` : undefined}
      />
      <Tile
        label="Volume complessivo"
        value={totals.totalVolume > 0 ? formatNumber(totals.totalVolume) : '-'}
        hint={totals.totalVolume > 0 ? 'ricerche al mese sul set' : 'metriche keyword non attive'}
      />
      <Tile label="Domini in SERP" value={formatNumber(totals.domains)} />
      <Tile
        label="Keyword con AI Overview"
        value={
          aiOverview.supported
            ? `${aiOverview.keywordsWithAio} / ${aiOverview.keywordsTotal}`
            : 'n.d.'
        }
        hint={
          aiOverview.supported
            ? formatPercent(
                aiOverview.keywordsTotal > 0
                  ? aiOverview.keywordsWithAio / aiOverview.keywordsTotal
                  : 0,
                0,
              ) + ' del set'
            : 'il provider SERP scelto non lo rileva'
        }
      />

      {ownSite && (
        <>
          <Tile
            label="Il tuo sito in SERP"
            value={`${ownSite.inSerpCount} / ${totals.completed}`}
            hint={
              ownSite.avgPosition != null
                ? `posizione media ${ownSite.avgPosition.toFixed(1)}`
                : 'mai presente'
            }
            accent
          />
          <Tile
            label="Il tuo Share of Voice"
            value={formatPercent(ownSite.shareOfVoice)}
            hint="quota del traffico stimato sul set di keyword"
            accent
          />
          <Tile
            label="Citazioni in AI Overview"
            value={aiOverview.supported ? formatNumber(ownSite.inAiCount) : 'n.d.'}
            hint={aiOverview.supported ? 'keyword in cui sei fra le fonti' : undefined}
            accent
          />
          <Tile
            label="Traffico stimato"
            value={formatNumber(Math.round(ownSite.estimatedTraffic))}
            hint="visite al mese, dalle posizioni attuali"
            accent
          />
        </>
      )}
    </div>
  )
}
