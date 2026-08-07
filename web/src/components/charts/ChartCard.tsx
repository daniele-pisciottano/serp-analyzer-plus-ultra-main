import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  /** Cosa deve leggere l'utente in questo grafico: sempre esplicito, mai implicito. */
  subtitle?: string
  note?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, note, actions, children, className }: ChartCardProps) {
  return (
    <section className={`card p-5 ${className ?? ''}`}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
      {note && <p className="text-xs text-ink-faint mt-3 leading-relaxed">{note}</p>}
    </section>
  )
}

/** Stato vuoto uniforme: spiega perche' non c'e' nulla, non lascia un buco. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-surface-border bg-surface-sunken px-6 py-8 text-center text-sm text-ink-muted">
      {children}
    </div>
  )
}
