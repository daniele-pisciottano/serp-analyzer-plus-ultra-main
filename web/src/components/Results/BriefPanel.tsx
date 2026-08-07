/**
 * Generazione dei content brief.
 *
 * L'utente sceglie le keyword su cui vuole lavorare: il brief costa una
 * chiamata AI ciascuno, quindi non ha senso generarli tutti d'ufficio.
 */
import { useState } from 'react'
import { AlertTriangle, Copy, Loader2, Sparkles } from 'lucide-react'
import type { AnalysisRun, ContentBrief, Credentials } from '../../types'
import { generateBrief, type AiContext } from '../../lib/ai/tasks'
import { pool } from '../../lib/pool'
import { INTENT_LABELS } from '../charts/Charts'
import { formatNumber } from '../charts/theme'

interface BriefPanelProps {
  run: AnalysisRun
  credentials: Credentials
  onBriefsChange: (run: AnalysisRun) => void
}

export function BriefPanel({ run, credentials, onBriefsChange }: BriefPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completed = run.results.filter((r) => r.status === 'done')
  // Le keyword da gap vanno in cima: sono quelle su cui il brief serve davvero
  const gapKeywords = new Set(run.aggregate?.contentGap.map((g) => g.keyword) ?? [])
  const ordered = [...completed].sort((a, b) => {
    const aGap = gapKeywords.has(a.keyword) ? 1 : 0
    const bGap = gapKeywords.has(b.keyword) ? 1 : 0
    if (aGap !== bGap) return bGap - aGap
    return (b.metrics?.searchVolume ?? 0) - (a.metrics?.searchVolume ?? 0)
  })

  const aiKey = {
    openai: credentials.openaiKey,
    anthropic: credentials.anthropicKey,
    gemini: credentials.geminiKey,
  }[run.config.aiProvider]

  const canGenerate = Boolean(aiKey.trim() && run.config.strongModel) && !run.isDemo

  const toggle = (keyword: string) => {
    const next = new Set(selected)
    if (next.has(keyword)) next.delete(keyword)
    else next.add(keyword)
    setSelected(next)
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)

    const context: AiContext = {
      provider: run.config.aiProvider,
      fastModel: run.config.fastModel,
      strongModel: run.config.strongModel,
      credentials,
    }

    const targets = ordered.filter((r) => selected.has(r.keyword))
    const briefs: ContentBrief[] = []

    try {
      // Concorrenza bassa: sono chiamate lunghe e i rate limit sono per token/minuto
      await pool(targets, 2, async (result) => {
        const audits = result.audits.filter((a) => a.ok)
        const avgWordCount =
          audits.length > 0
            ? Math.round(audits.reduce((sum, a) => sum + a.wordCount, 0) / audits.length)
            : 1000

        const brief = await generateBrief(
          {
            keyword: result.keyword,
            searchVolume: result.metrics?.searchVolume ?? null,
            intent: INTENT_LABELS[result.metrics?.intent ?? 'unknown'],
            competitorTitles: (result.serp?.organic ?? []).slice(0, 8).map((o) => o.title),
            competitorHeadings: audits.flatMap((a) => [...a.h2, ...a.h3]),
            avgWordCount,
            peopleAlsoAsk: result.serp?.peopleAlsoAsk ?? [],
            relatedSearches: result.serp?.relatedSearches ?? [],
            customClusters: run.config.customClusters,
            aiOverviewText: result.serp?.aiOverview.text ?? '',
          },
          context,
        )
        briefs.push(brief)
      })

      const merged = [
        ...run.briefs.filter((b) => !briefs.some((n) => n.keyword === b.keyword)),
        ...briefs,
      ]
      onBriefsChange({ ...run, briefs: merged })
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nella generazione dei brief')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Genera un content brief</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
              Seleziona le keyword su cui vuoi lavorare. Il brief usa i titoli e gli heading dei
              competitor, le domande correlate e, quando c'e', il contenuto dell'AI Overview. Le
              keyword con un content gap sono in cima.
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={!canGenerate || selected.size === 0 || generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Genera {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>

        {!canGenerate && (
          <p className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {run.isDemo
              ? 'I brief non si generano in modalita demo: servono dati reali e una chiave AI.'
              : 'Serve una API key del provider AI e un modello selezionato nella configurazione.'}
          </p>
        )}

        {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{error}</p>}

        <div className="mt-4 grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((result) => (
            <label
              key={result.keyword}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                selected.has(result.keyword)
                  ? 'border-brand-200 bg-brand-50'
                  : 'border-surface-border hover:bg-surface-sunken'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-brand"
                checked={selected.has(result.keyword)}
                onChange={() => toggle(result.keyword)}
              />
              <span>
                <span className="font-medium text-ink">{result.keyword}</span>
                <span className="mt-0.5 block text-ink-faint">
                  {result.metrics?.searchVolume != null
                    ? `${formatNumber(result.metrics.searchVolume)}/mese`
                    : 'volume n.d.'}
                  {gapKeywords.has(result.keyword) && (
                    <span className="ml-2 font-medium text-brand">content gap</span>
                  )}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {run.briefs.map((brief) => (
        <BriefCard key={brief.keyword} brief={brief} />
      ))}
    </div>
  )
}

function BriefCard({ brief }: { brief: ContentBrief }) {
  const [copied, setCopied] = useState(false)

  const asMarkdown = () => {
    const lines = [
      `# ${brief.h1}`,
      '',
      `**Keyword:** ${brief.keyword}`,
      `**Angolo:** ${brief.angle}`,
      `**Lunghezza target:** ${brief.targetWordCount} parole`,
      '',
      '## Struttura',
      ...brief.outline.map(
        (item) =>
          `${item.level === 2 ? '##' : '###'} ${item.text}${item.note ? `\n> ${item.note}` : ''}`,
      ),
      '',
      '## Entita da coprire',
      ...brief.entities.map((e) => `- ${e}`),
      '',
      '## Domande a cui rispondere',
      ...brief.questionsToCover.map((q) => `- ${q}`),
      '',
      '## Link interni',
      ...brief.internalLinks.map((l) => `- ${l}`),
    ]
    return lines.join('\n')
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {brief.keyword}
          </p>
          <h3 className="mt-1 text-base font-semibold text-ink">{brief.h1}</h3>
          {brief.angle && <p className="mt-1 text-xs text-ink-muted">{brief.angle}</p>}
        </div>
        <button
          className="btn-ghost px-2.5 py-1.5 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(asMarkdown())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copiato' : 'Copia in markdown'}
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Struttura</p>
          <ol className="mt-2 space-y-2">
            {brief.outline.map((item, index) => (
              <li
                key={`${item.text}-${index}`}
                className={`text-xs ${item.level === 3 ? 'ml-5' : ''}`}
              >
                <span className="font-medium text-ink">
                  {item.level === 2 ? 'H2' : 'H3'} - {item.text}
                </span>
                {item.note && <span className="mt-0.5 block text-ink-muted">{item.note}</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-ink-faint">Lunghezza target</p>
            <p className="mt-1 text-ink">{formatNumber(brief.targetWordCount)} parole</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-ink-faint">
              Entita da coprire
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {brief.entities.map((entity) => (
                <span key={entity} className="badge bg-surface-sunken text-ink-muted">
                  {entity}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wide text-ink-faint">
              Domande a cui rispondere
            </p>
            <ul className="mt-1.5 space-y-1 text-ink-muted">
              {brief.questionsToCover.map((question) => (
                <li key={question}>- {question}</li>
              ))}
            </ul>
          </div>
          {brief.internalLinks.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wide text-ink-faint">Link interni</p>
              <ul className="mt-1.5 space-y-1 text-ink-muted">
                {brief.internalLinks.map((link) => (
                  <li key={link}>- {link}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
