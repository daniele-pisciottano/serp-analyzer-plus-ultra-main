/**
 * Tutorial iniziale.
 *
 * Compare al primo accesso e resta sempre raggiungibile dalla tab "Come
 * funziona". Include la modalita' demo, che permette di vedere l'output
 * completo senza inserire nessuna chiave API.
 */
import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Download,
  ExternalLink,
  KeyRound,
  PlayCircle,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

interface TutorialProps {
  onFinish: () => void
  onStartDemo: () => void
  /** In overlay mostra il pulsante "salta", in tab no */
  variant: 'overlay' | 'page'
}

interface Step {
  icon: typeof Search
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    icon: Search,
    title: 'Cosa fa questo strumento',
    body: (
      <div className="space-y-3">
        <p>
          Inserisci una lista di keyword e l'app interroga Google per ognuna, poi mette insieme le
          informazioni che servono a decidere cosa scrivere e cosa ottimizzare:
        </p>
        <ul className="space-y-1.5 pl-1">
          {[
            'chi occupa la SERP e con quale tipo di pagina',
            'se compare l’AI Overview, quali fonti cita e perche',
            'volume, difficolta e intento di ricerca di ogni keyword',
            'quanto pesi tu rispetto ai competitor (Share of Voice)',
            'le keyword dove i competitor ci sono e tu no (content gap)',
            'i tuoi contenuti che si fanno concorrenza fra loro (cannibalizzazione)',
            'un audit on-page delle pagine meglio posizionate',
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    icon: KeyRound,
    title: 'Le chiavi API che ti servono',
    body: (
      <div className="space-y-4">
        <p>
          L'app non ha un backend con le chiavi: usi le tue. Ne servono due, piu' una facoltativa.
        </p>

        <div className="space-y-3">
          <KeyCard
            title="1. Dati SERP: Serper oppure DataForSEO"
            href="https://serper.dev"
            hrefLabel="serper.dev"
            secondHref="https://dataforseo.com"
            secondLabel="dataforseo.com"
          >
            <p>
              <strong>Serper</strong> costa poco ed e' velocissimo, ma non restituisce l'AI Overview
              in forma strutturata ne' i volumi di ricerca.
            </p>
            <p>
              <strong>DataForSEO</strong> costa un po' di piu' ed e' l'unico dei due che espone AI
              Overview, volume, difficolta' e intento. Se l'AI Overview ti interessa, scegli questo.
            </p>
            <p className="text-ink-faint">
              Puoi anche combinarli: SERP da Serper e sole metriche keyword da DataForSEO.
            </p>
          </KeyCard>

          <KeyCard
            title="2. Provider AI: OpenAI, Anthropic o Google Gemini"
            href="https://console.anthropic.com/settings/keys"
            hrefLabel="console Anthropic"
            secondHref="https://platform.openai.com/api-keys"
            secondLabel="platform OpenAI"
          >
            <p>
              Serve per classificare le pagine, raggruppare le keyword, analizzare le fonti dell'AI
              Overview e generare i content brief. Puoi scegliere provider e modello, e usare un
              modello veloce per il lavoro di volume e uno piu' capace per le analisi.
            </p>
          </KeyCard>

          <KeyCard
            title="3. PageSpeed Insights (facoltativa, gratuita)"
            href="https://developers.google.com/speed/docs/insights/v5/get-started"
            hrefLabel="come ottenerla"
          >
            <p>Solo se vuoi i Core Web Vitals reali delle tue pagine.</p>
          </KeyCard>
        </div>

        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Le chiavi restano nel tuo browser e vengono usate solo per le chiamate che lanci tu. Di
            default spariscono quando chiudi la scheda. Se attivi "ricorda le chiavi" restano
            salvate su questo computer: non farlo su un dispositivo condiviso.
          </p>
        </div>
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: 'Prepara l’analisi',
    body: (
      <div className="space-y-3">
        <p>
          Nella tab <strong>Configurazione</strong> imposta paese, lingua e numero di risultati da
          leggere. Due campi cambiano molto la qualita' dell'output:
        </p>
        <div className="space-y-3">
          <FieldNote title="Il tuo dominio">
            Abilita tracking, Share of Voice, content gap, cannibalizzazione e il confronto on-page
            fra le tue pagine e quelle dei competitor. Basta il dominio: <code>miosito.it</code>.
          </FieldNote>
          <FieldNote title="Cluster personalizzati">
            Elenca le pagine o le sezioni reali del tuo sito, una per riga. Le keyword verranno
            assegnate prima di tutto a questi cluster, cosi' l'output ti dice su quale pagina
            esistente lavorare invece di proporti categorie astratte.
            <pre className="mt-2 rounded bg-surface-sunken p-2 text-[11px] leading-relaxed text-ink-muted">{`Servizi SEO
Corsi online
Consulenza marketing
Blog
Chi siamo`}</pre>
          </FieldNote>
        </div>
        <p className="text-ink-muted">
          Poi incolla le keyword nella tab <strong>Analisi</strong>, una per riga. Prima di partire
          vedrai una stima dei costi.
        </p>
      </div>
    ),
  },
  {
    icon: BarChart3,
    title: 'Come leggere i risultati',
    body: (
      <div className="space-y-3">
        <p>
          I risultati compaiono man mano che arrivano: puoi fermarti a meta' e tenere quello che e'
          gia' stato raccolto. In tutti i grafici vale la stessa convenzione:{' '}
          <span className="font-semibold" style={{ color: '#2a78d6' }}>
            blu
          </span>{' '}
          per il mercato e i competitor, <span className="font-semibold text-brand">rosso</span> per
          il tuo sito.
        </p>
        <div className="space-y-2">
          <FieldNote title="Panoramica">
            I numeri chiave e i domini che dominano il set di keyword.
          </FieldNote>
          <FieldNote title="Opportunita">
            Content gap ordinato per potenziale, e cannibalizzazione da risolvere.
          </FieldNote>
          <FieldNote title="AI Overview">
            Su quante keyword compare, chi viene citato e perche' quelle pagine funzionano.
          </FieldNote>
          <FieldNote title="On-page">
            Come sono fatte le pagine che si posizionano e cosa manca alle tue.
          </FieldNote>
        </div>
      </div>
    ),
  },
  {
    icon: Download,
    title: 'Esporta e riparti',
    body: (
      <div className="space-y-3">
        <p>
          Da <strong>Risultati</strong> scarichi il report Excel completo: un foglio per ogni
          analisi, con i grafici inclusi come immagini, pronto da condividere o allegare a un
          documento di strategia.
        </p>
        <p>
          Puoi anche generare un <strong>content brief</strong> per le keyword che ti interessano:
          struttura degli heading, entita' da coprire, domande a cui rispondere e lunghezza target
          ricavata dai competitor.
        </p>
        <p className="text-ink-muted">
          La configurazione resta salvata: la prossima analisi parte gia' impostata.
        </p>
      </div>
    ),
  },
]

function KeyCard({
  title,
  href,
  hrefLabel,
  secondHref,
  secondLabel,
  children,
}: {
  title: string
  href: string
  hrefLabel: string
  secondHref?: string
  secondLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-surface-border p-3">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-muted">{children}</div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <a
          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {hrefLabel} <ExternalLink className="h-3 w-3" />
        </a>
        {secondHref && (
          <a
            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            href={secondHref}
            target="_blank"
            rel="noreferrer"
          >
            {secondLabel} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}

function FieldNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function Tutorial({ onFinish, onStartDemo, variant }: TutorialProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  const content = (
    <div className="flex max-h-[86vh] flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-surface-border px-6 py-5">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Passo {step + 1} di {STEPS.length}
            </p>
            <h2 className="text-lg font-semibold text-ink">{current.title}</h2>
          </div>
        </div>
        {variant === 'overlay' && (
          <button className="text-xs font-medium text-ink-muted hover:text-ink" onClick={onFinish}>
            Salta
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink-muted">
        {current.body}
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-surface-border px-6 py-4">
        <div className="flex gap-1.5">
          {STEPS.map((s, index) => (
            <button
              key={s.title}
              aria-label={`Vai al passo ${index + 1}`}
              onClick={() => setStep(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === step ? 'w-6 bg-brand' : 'w-1.5 bg-surface-border hover:bg-ink-faint'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={onStartDemo}>
            <PlayCircle className="h-4 w-4" />
            Prova la demo
          </button>
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </button>
          )}
          <button className="btn-primary" onClick={() => (isLast ? onFinish() : setStep(step + 1))}>
            {isLast ? 'Iniziamo' : 'Avanti'}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </footer>
    </div>
  )

  if (variant === 'page') {
    return <div className="card mx-auto max-w-3xl overflow-hidden">{content}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-surface shadow-2xl">
        {content}
      </div>
    </div>
  )
}
