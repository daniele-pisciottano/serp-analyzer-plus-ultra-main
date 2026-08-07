/**
 * Pannello di configurazione: credenziali, provider SERP, provider e modelli AI,
 * parametri di ricerca e opzioni di analisi.
 *
 * Le capacita' del provider SERP scelto guidano la UI: le funzioni che quel
 * provider non supporta restano visibili ma disabilitate, con la ragione
 * scritta accanto, invece di sparire o produrre sezioni vuote.
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import type { AiProvider, AiModelInfo, AnalysisConfig, Credentials, SerpProvider } from '../types'
import { SERP_CAPABILITIES } from '../types'
import { LANGUAGE_OPTIONS, LOCATION_OPTIONS } from '../lib/options'
import { listModels, pickDefaultModel } from '../lib/ai/client'
import { PROVIDER_KEY_URLS, PROVIDER_LABELS } from '../lib/ai/protocol'
import { clearCredentials, isRemembering, setRemember } from '../lib/storage'

interface SettingsPanelProps {
  config: AnalysisConfig
  credentials: Credentials
  onConfigChange: (config: AnalysisConfig) => void
  onCredentialsChange: (credentials: Credentials) => void
}

function SecretInput({
  label,
  value,
  placeholder,
  onChange,
  hint,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  hint?: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          className="input pr-10"
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? 'Nascondi' : 'Mostra'}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-ink"
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  disabledReason,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-surface-border bg-surface-sunken opacity-70'
          : checked
            ? 'border-brand-200 bg-brand-50'
            : 'border-surface-border hover:bg-surface-sunken'
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-brand"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
        {disabled && disabledReason && (
          <span className="mt-1 flex items-start gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {disabledReason}
          </span>
        )}
      </span>
    </label>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="card p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function SettingsPanel({
  config,
  credentials,
  onConfigChange,
  onCredentialsChange,
}: SettingsPanelProps) {
  const [models, setModels] = useState<AiModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [remember, setRememberState] = useState(isRemembering())

  const capabilities = SERP_CAPABILITIES[config.serpProvider]
  const hasDfsCredentials = Boolean(
    credentials.dataforseoLogin.trim() && credentials.dataforseoPassword.trim(),
  )
  // Le metriche keyword arrivano sempre da DataForSEO Labs, anche quando le SERP
  // vengono da Serper: bastano le credenziali, non serve cambiare provider.
  const metricsAvailable = hasDfsCredentials
  const aiOverviewAvailable = capabilities.aiOverview

  const update = <K extends keyof AnalysisConfig>(key: K, value: AnalysisConfig[K]) => {
    onConfigChange({ ...config, [key]: value })
  }

  const updateCredential = <K extends keyof Credentials>(key: K, value: string) => {
    onCredentialsChange({ ...credentials, [key]: value })
  }

  const aiKeyPresent = {
    openai: Boolean(credentials.openaiKey.trim()),
    anthropic: Boolean(credentials.anthropicKey.trim()),
    gemini: Boolean(credentials.geminiKey.trim()),
  }[config.aiProvider]

  async function refreshModels(provider: AiProvider) {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const list = await listModels(provider, credentials)
      setModels(list)
      if (list.length === 0) {
        setModelsError(
          'Non e stato possibile leggere l elenco dei modelli: inserisci l ID del modello a mano.',
        )
      } else {
        // Se i modelli attuali non esistono piu' nel nuovo provider, ne scegliamo di validi
        const ids = new Set(list.map((m) => m.id))
        const next = { ...config }
        if (!ids.has(next.strongModel)) next.strongModel = pickDefaultModel(list, 'strong')
        if (!ids.has(next.fastModel)) next.fastModel = pickDefaultModel(list, 'fast')
        if (next.strongModel !== config.strongModel || next.fastModel !== config.fastModel) {
          onConfigChange(next)
        }
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Errore nel recupero dei modelli')
    } finally {
      setLoadingModels(false)
    }
  }

  // Ricarica l'elenco quando cambia provider o compare la chiave
  useEffect(() => {
    if (aiKeyPresent) void refreshModels(config.aiProvider)
    else setModels([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.aiProvider, aiKeyPresent])

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Provider dei dati SERP"
        description="Da qui arrivano risultati organici, People also ask e ricerche correlate."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SERP_CAPABILITIES) as SerpProvider[]).map((provider) => {
            const cap = SERP_CAPABILITIES[provider]
            const active = config.serpProvider === provider
            return (
              <button
                key={provider}
                onClick={() => update('serpProvider', provider)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? 'border-brand bg-brand-50'
                    : 'border-surface-border hover:bg-surface-sunken'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{cap.label}</span>
                  {active && <Check className="h-4 w-4 text-brand" />}
                </span>
                <span className="mt-2 block space-y-1 text-xs text-ink-muted">
                  <span className="block">
                    {cap.aiOverview ? '✓' : '✗'} AI Overview strutturato
                  </span>
                  <span className="block">
                    {cap.keywordMetrics ? '✓' : '✗'} Volume e difficolta keyword
                  </span>
                  <span className="block text-ink-faint">
                    ~{cap.costPerQueryUsd.toFixed(3)} $ per query
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {config.serpProvider === 'serper' && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Serper non restituisce l'AI Overview in forma strutturata: tutte le analisi legate
              all'AI Overview resteranno vuote. Per averle serve DataForSEO.
            </p>
          </div>
        )}

        {config.serpProvider === 'serper' ? (
          <SecretInput
            label="API key Serper"
            value={credentials.serperKey}
            placeholder="Chiave da serper.dev"
            onChange={(v) => updateCredential('serperKey', v)}
            hint={
              <a
                className="inline-flex items-center gap-1 text-brand hover:underline"
                href="https://serper.dev/api-key"
                target="_blank"
                rel="noreferrer"
              >
                Dove trovarla <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <SecretInput
            label="Login DataForSEO"
            value={credentials.dataforseoLogin}
            placeholder="email dell'account"
            onChange={(v) => updateCredential('dataforseoLogin', v)}
          />
          <SecretInput
            label="Password DataForSEO"
            value={credentials.dataforseoPassword}
            placeholder="password API"
            onChange={(v) => updateCredential('dataforseoPassword', v)}
          />
        </div>
        <p className="hint">
          Servono anche con Serper selezionato, se vuoi volume, difficolta e intento: quelle
          metriche esistono solo su DataForSEO Labs.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        title="Provider AI e modelli"
        description="Usati per classificare le pagine, raggruppare le keyword, analizzare l'AI Overview e scrivere i brief."
      >
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((provider) => (
            <button
              key={provider}
              onClick={() => update('aiProvider', provider)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                config.aiProvider === provider
                  ? 'border-brand bg-brand-50 text-brand-700'
                  : 'border-surface-border text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {PROVIDER_LABELS[provider]}
            </button>
          ))}
        </div>

        <SecretInput
          label={`API key ${PROVIDER_LABELS[config.aiProvider]}`}
          value={
            config.aiProvider === 'openai'
              ? credentials.openaiKey
              : config.aiProvider === 'anthropic'
                ? credentials.anthropicKey
                : credentials.geminiKey
          }
          onChange={(v) =>
            updateCredential(
              config.aiProvider === 'openai'
                ? 'openaiKey'
                : config.aiProvider === 'anthropic'
                  ? 'anthropicKey'
                  : 'geminiKey',
              v,
            )
          }
          hint={
            <a
              className="inline-flex items-center gap-1 text-brand hover:underline"
              href={PROVIDER_KEY_URLS[config.aiProvider]}
              target="_blank"
              rel="noreferrer"
            >
              Dove trovarla <ExternalLink className="h-3 w-3" />
            </a>
          }
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">
            {models.length > 0
              ? `${models.length} modelli disponibili`
              : 'Inserisci la chiave per leggere i modelli disponibili'}
          </p>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={!aiKeyPresent || loadingModels}
            onClick={() => void refreshModels(config.aiProvider)}
          >
            {loadingModels ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Aggiorna
          </button>
        </div>

        {modelsError && (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{modelsError}</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <ModelPicker
            label="Modello per le analisi"
            hint="AI Overview, clustering, content brief"
            models={models}
            value={config.strongModel}
            onChange={(v) => update('strongModel', v)}
          />
          <ModelPicker
            label="Modello veloce"
            hint="Classificazione delle pagine, lavoro di volume"
            models={models}
            value={config.fastModel}
            onChange={(v) => update('fastModel', v)}
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Parametri di ricerca">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Paese</label>
            <select
              className="input"
              value={config.country}
              onChange={(e) => update('country', e.target.value)}
            >
              {LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Lingua</label>
            <select
              className="input"
              value={config.language}
              onChange={(e) => update('language', e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Dispositivo</label>
            <select
              className="input"
              value={config.device}
              onChange={(e) => update('device', e.target.value as 'desktop' | 'mobile')}
            >
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div>
            <label className="label">Risultati per keyword: {config.numResults}</label>
            <input
              type="range"
              min={5}
              max={20}
              step={1}
              className="w-full accent-brand"
              value={config.numResults}
              onChange={(e) => update('numResults', Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label">Il tuo dominio</label>
          <input
            className="input"
            placeholder="miosito.it"
            value={config.ownSiteDomain}
            onChange={(e) => update('ownSiteDomain', normalizeDomainInput(e.target.value))}
          />
          <p className="hint">
            Abilita tracking, Share of Voice, content gap, cannibalizzazione e confronto on-page.
            Senza dominio queste sezioni restano vuote.
          </p>
        </div>

        <div>
          <label className="label">Cluster personalizzati</label>
          <textarea
            className="input min-h-[110px] font-mono text-xs"
            placeholder={'Servizi SEO\nCorsi online\nConsulenza marketing\nBlog'}
            value={config.customClusters.join('\n')}
            onChange={(e) =>
              update(
                'customClusters',
                e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              )
            }
          />
          <p className="hint">
            Le pagine o sezioni reali del tuo sito, una per riga. Le keyword vengono assegnate prima
            a questi cluster, cosi' sai su quale pagina intervenire.
          </p>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Cosa analizzare" description="Ogni opzione in piu' aggiunge tempo e costo.">
        <div className="space-y-3">
          <Toggle
            checked={config.enableKeywordMetrics}
            onChange={(v) => update('enableKeywordMetrics', v)}
            label="Metriche keyword"
            description="Volume, CPC, difficolta, intento e trend a 12 mesi. Una sola chiamata per tutte le keyword."
            disabled={!metricsAvailable}
            disabledReason="Servono le credenziali DataForSEO"
          />
          <Toggle
            checked={config.enableAiOverviewAnalysis}
            onChange={(v) => update('enableAiOverviewAnalysis', v)}
            label="AI Overview"
            description="Rileva l'AI Overview, raccoglie le fonti citate e analizza perche' quelle pagine vengono scelte."
            disabled={!aiOverviewAvailable}
            disabledReason="Serper non espone l'AI Overview: passa a DataForSEO"
          />
          <Toggle
            checked={config.enableOnPageAudit}
            onChange={(v) => update('enableOnPageAudit', v)}
            label="Audit on-page"
            description="Title, meta, heading, lunghezza, link e immagini delle pagine posizionate."
          />
          <Toggle
            checked={config.enableStructuredData}
            onChange={(v) => update('enableStructuredData', v)}
            label="Dati strutturati"
            description="Schema.org usati dai competitor: FAQ, breadcrumb, review, organization."
          />
          <Toggle
            checked={config.enableClustering}
            onChange={(v) => update('enableClustering', v)}
            label="Clustering semantico"
            description="Raggruppa le keyword, dando priorita' ai tuoi cluster personalizzati."
          />
          <Toggle
            checked={config.useAiClassification}
            onChange={(v) => update('useAiClassification', v)}
            label="Classificazione AI delle pagine"
            description="Le regole coprono la maggior parte dei casi; l'AI risolve i restanti in un'unica chiamata."
          />
          <Toggle
            checked={config.enableCoreWebVitals}
            onChange={(v) => update('enableCoreWebVitals', v)}
            label="Core Web Vitals delle tue pagine"
            description="Dati reali da PageSpeed Insights. Lento: massimo 5 pagine per analisi."
            disabled={!config.ownSiteDomain}
            disabledReason="Imposta prima il tuo dominio"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Pagine analizzate per keyword: {config.maxPagesPerQuery}
            </label>
            <input
              type="range"
              min={0}
              max={10}
              className="w-full accent-brand"
              value={config.maxPagesPerQuery}
              onChange={(e) => update('maxPagesPerQuery', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Richieste in parallelo: {config.concurrency}</label>
            <input
              type="range"
              min={1}
              max={8}
              className="w-full accent-brand"
              value={config.concurrency}
              onChange={(e) => update('concurrency', Number(e.target.value))}
            />
            <p className="hint">Alzarlo velocizza, ma aumenta il rischio di rate limit.</p>
          </div>
        </div>

        {config.enableCoreWebVitals && (
          <SecretInput
            label="API key PageSpeed Insights (facoltativa)"
            value={credentials.psiKey}
            placeholder="senza chiave il limite di richieste e' molto basso"
            onChange={(v) => updateCredential('psiKey', v)}
          />
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section title="Sicurezza delle chiavi">
        <div className="flex gap-3 rounded-lg border border-surface-border bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <p>
            Le chiavi restano in questo browser e vengono inviate solo alle funzioni di questa app,
            che le usano per la singola chiamata verso il provider e non le salvano. Di default
            spariscono quando chiudi la scheda.
          </p>
        </div>

        <Toggle
          checked={remember}
          onChange={(value) => {
            setRememberState(value)
            setRemember(value, credentials)
          }}
          label="Ricorda le chiavi su questo computer"
          description="Le salva nel localStorage del browser. Non attivarlo su un dispositivo condiviso."
        />

        <button
          className="btn-ghost text-brand"
          onClick={() => {
            clearCredentials()
            setRememberState(false)
            onCredentialsChange({
              serperKey: '',
              dataforseoLogin: '',
              dataforseoPassword: '',
              openaiKey: '',
              anthropicKey: '',
              geminiKey: '',
              psiKey: '',
            })
          }}
        >
          <Trash2 className="h-4 w-4" />
          Cancella tutte le chiavi
        </button>
      </Section>
    </div>
  )
}

function ModelPicker({
  label,
  hint,
  models,
  value,
  onChange,
}: {
  label: string
  hint: string
  models: AiModelInfo[]
  value: string
  onChange: (value: string) => void
}) {
  const known = models.some((m) => m.id === value)

  return (
    <div>
      <label className="label">{label}</label>
      {models.length > 0 ? (
        <select
          className="input"
          value={known ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Seleziona un modello</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
              {model.tier === 'fast' ? ' - veloce' : model.tier === 'strong' ? ' - capace' : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input font-mono text-xs"
          value={value}
          placeholder="ID del modello"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="hint">{hint}</p>
    </div>
  )
}

/** Accetta un URL completo e ne tiene solo il dominio. */
function normalizeDomainInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return new URL(withProtocol).hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '')
  }
}
