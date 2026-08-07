/**
 * Token dei grafici.
 *
 * La palette e' quella validata dello skill dataviz, verificata con lo script
 * sul nostro fondo bianco: blu #2a78d6 e rosso brand #E52217 passano tutti i
 * controlli, incluso quello per le persone con deficit di visione dei colori
 * (peggior coppia all-pairs deltaE 27.3 protan, 35.9 a visione normale).
 *
 * Regola di lettura costante in tutta l'app: blu = competitor / mercato,
 * rosso = il tuo sito. Il colore segue l'entita', mai la posizione in classifica.
 */

export const CHART = {
  series: '#2a78d6',
  own: '#E52217',
  accent: '#1baf7a',
  grid: '#E3E8EF',
  axis: '#8A94A6',
  ink: '#14171F',
  inkMuted: '#5B6472',
  surface: '#FFFFFF',
} as const

/** Ramp sequenziale a una tinta, dal chiaro al scuro. Usata per heatmap e treemap. */
export const BLUE_RAMP = [
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
] as const

/** Posizione 1 -> tinta piu' intensa. Oltre la decima, grigio quasi neutro. */
export function positionColor(position: number): string {
  if (position < 1 || position > 30) return '#EDF1F6'
  const index = Math.min(BLUE_RAMP.length - 1, Math.max(0, BLUE_RAMP.length - position))
  return BLUE_RAMP[index]
}

/** Testo leggibile sopra una cella della ramp. */
export function positionTextColor(position: number): string {
  return position <= 3 ? '#FFFFFF' : CHART.ink
}

export const AXIS_PROPS = {
  stroke: CHART.axis,
  fontSize: 12,
  tickLine: false,
} as const

export const GRID_PROPS = {
  stroke: CHART.grid,
  strokeDasharray: '0',
  vertical: false,
} as const

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null) return '-'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}
