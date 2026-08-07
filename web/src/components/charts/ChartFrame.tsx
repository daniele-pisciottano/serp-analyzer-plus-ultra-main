/**
 * Contenitore dei grafici.
 *
 * `ResponsiveContainer` di Recharts misura il genitore al montaggio: se in quel
 * momento la larghezza non e' ancora definita (cambio di tab, primo paint del
 * bundle di produzione) l'area di disegno resta a zero e il grafico non compare,
 * senza alcun errore. Qui misuriamo noi con un ResizeObserver e passiamo a
 * Recharts numeri espliciti, cosi' il grafico si disegna solo quando lo spazio
 * e' noto e si ridisegna a ogni cambio di dimensione.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ChartFrameProps {
  height: number
  children: (size: { width: number; height: number }) => ReactNode
}

export function ChartFrame({ height, children }: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().width)
      setWidth((current) => (Math.abs(current - next) > 1 ? next : current))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {width > 0 ? children({ width, height }) : null}
    </div>
  )
}
