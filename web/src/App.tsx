import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, BookOpen, PlayCircle, Search, Settings2 } from 'lucide-react'
import { AnalysisPanel, parseKeywords } from './components/AnalysisPanel'
import { Results } from './components/Results'
import { SettingsPanel } from './components/SettingsPanel'
import { Tutorial } from './components/Tutorial'
import { resolveConfig } from './lib/config'
import { buildDemoRun } from './lib/demo'
import { runAnalysis } from './lib/runner'
import {
  hasSeenTutorial,
  loadConfig,
  loadCredentials,
  markTutorialSeen,
  saveConfig,
  saveCredentials,
} from './lib/storage'
import type { AnalysisConfig, AnalysisRun, Credentials, KeywordResult, RunProgress } from './types'

type TabId = 'tutorial' | 'config' | 'analisi' | 'risultati'

const TABS: { id: TabId; label: string; icon: typeof Search }[] = [
  { id: 'tutorial', label: 'Come funziona', icon: BookOpen },
  { id: 'config', label: 'Configurazione', icon: Settings2 },
  { id: 'analisi', label: 'Analisi', icon: Search },
  { id: 'risultati', label: 'Risultati', icon: BarChart3 },
]

const IDLE_PROGRESS: RunProgress = {
  phase: 'idle',
  completed: 0,
  total: 0,
  currentKeywords: [],
  message: '',
  errors: [],
}

export default function App() {
  const [tab, setTab] = useState<TabId>('analisi')
  const [showTutorial, setShowTutorial] = useState(!hasSeenTutorial())

  const [config, setConfig] = useState<AnalysisConfig>(() => loadConfig())
  const [credentials, setCredentials] = useState<Credentials>(() => loadCredentials())
  const [keywordsText, setKeywordsText] = useState('')

  const [progress, setProgress] = useState<RunProgress>(IDLE_PROGRESS)
  const [liveResults, setLiveResults] = useState<KeywordResult[]>([])
  const [run, setRun] = useState<AnalysisRun | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => saveConfig(config), [config])
  useEffect(() => saveCredentials(credentials), [credentials])

  const handleStart = useCallback(async () => {
    const keywords = parseKeywords(keywordsText)
    const controller = new AbortController()
    abortRef.current = controller

    setIsRunning(true)
    setRunError(null)
    setRun(null)
    setLiveResults([])

    try {
      const result = await runAnalysis({
        keywords,
        // Il runner riceve la configurazione effettiva: le opzioni che il
        // provider non supporta sono gia' spente, come mostrato nella UI
        config: resolveConfig(config, credentials),
        credentials,
        signal: controller.signal,
        onProgress: setProgress,
        // Copia superficiale a ogni aggiornamento: React deve vedere un nuovo array
        onResult: (updated) =>
          setLiveResults((current) => {
            const next = [...current]
            const index = next.findIndex((r) => r.keyword === updated.keyword)
            if (index >= 0) next[index] = { ...updated }
            else next.push({ ...updated })
            return next
          }),
      })
      setRun(result)

      // Se nessuna keyword e' arrivata in fondo non ha senso mandare l'utente
      // sui risultati vuoti: resta qui, dove c'e' l'elenco degli errori.
      const completed = result.results.filter((r) => r.status === 'done')
      if (completed.length > 0) {
        setTab('risultati')
      } else {
        const first = result.results.find((r) => r.error)?.error
        setRunError(
          `Nessuna keyword completata. Controlla le credenziali nella configurazione.${
            first ? ` Primo errore: ${first}.` : ''
          }`,
        )
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Errore inatteso durante l analisi')
    } finally {
      setIsRunning(false)
      abortRef.current = null
    }
  }, [keywordsText, config, credentials])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleDemo = useCallback(() => {
    setShowTutorial(false)
    markTutorialSeen()
    const demo = buildDemoRun()
    setRun(demo)
    setLiveResults(demo.results)
    setProgress({ ...IDLE_PROGRESS, phase: 'done', message: 'Dataset dimostrativo caricato' })
    setTab('risultati')
  }, [])

  const handleExport = useCallback(async () => {
    if (!run) return
    setExporting(true)
    try {
      // Caricato solo al momento del download: exceljs pesa parecchio
      const { exportRunToExcel } = await import('./lib/export/excel')
      await exportRunToExcel(run)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Errore nella generazione del file Excel')
    } finally {
      setExporting(false)
    }
  }, [run])

  return (
    <div className="min-h-screen">
      {showTutorial && (
        <Tutorial
          variant="overlay"
          onFinish={() => {
            setShowTutorial(false)
            markTutorialSeen()
          }}
          onStartDemo={handleDemo}
        />
      )}

      <header className="border-b border-surface-border bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
              <Search className="h-4.5 w-4.5" />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight text-ink">
                SERP Analyzer Plus Ultra
              </h1>
              <p className="text-xs text-ink-muted">
                SERP, AI Overview, metriche keyword e opportunita in un unico report
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
            {TABS.map((item) => {
              const Icon = item.icon
              const disabled = item.id === 'risultati' && !run
              return (
                <button
                  key={item.id}
                  disabled={disabled}
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    tab === item.id
                      ? 'bg-surface text-ink shadow-sm'
                      : disabled
                        ? 'cursor-not-allowed text-ink-faint'
                        : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {runError && (
          <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {runError}
          </p>
        )}

        {tab === 'tutorial' && (
          <Tutorial variant="page" onFinish={() => setTab('config')} onStartDemo={handleDemo} />
        )}

        {tab === 'config' && (
          <SettingsPanel
            config={config}
            credentials={credentials}
            onConfigChange={setConfig}
            onCredentialsChange={setCredentials}
          />
        )}

        {tab === 'analisi' && (
          <div className="space-y-5">
            {!run && !isRunning && (
              <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
                <p className="text-sm text-ink-muted">
                  Prima volta qui? Carica il dataset dimostrativo per vedere cosa produce l analisi,
                  senza inserire nessuna chiave.
                </p>
                <button className="btn-ghost" onClick={handleDemo}>
                  <PlayCircle className="h-4 w-4" />
                  Apri la demo
                </button>
              </div>
            )}

            <AnalysisPanel
              keywordsText={keywordsText}
              onKeywordsChange={setKeywordsText}
              config={config}
              credentials={credentials}
              progress={progress}
              results={liveResults}
              isRunning={isRunning}
              onStart={() => void handleStart()}
              onStop={handleStop}
            />
          </div>
        )}

        {tab === 'risultati' && run && (
          <Results
            run={run}
            credentials={credentials}
            onExport={() => void handleExport()}
            exporting={exporting}
            onBriefsChange={setRun}
          />
        )}
      </main>

      <footer className="border-t border-surface-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-4 text-xs text-ink-faint">
          Le chiavi API restano nel tuo browser. Le funzioni di questa app le usano solo per la
          singola chiamata verso il provider e non le conservano.
        </div>
      </footer>
    </div>
  )
}
