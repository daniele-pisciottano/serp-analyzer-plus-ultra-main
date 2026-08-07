/**
 * Tabella dati riusabile: ordinamento per colonna, ricerca testuale e
 * scorrimento orizzontale confinato alla tabella, mai alla pagina.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  /** Valore usato per ordinamento e ricerca */
  value: (row: T) => string | number | null
  /** Come mostrarlo; se assente si usa `value` */
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface DataTableProps<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T, index: number) => string
  searchable?: boolean
  emptyMessage?: string
  pageSize?: number
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchable = true,
  emptyMessage = 'Nessun dato da mostrare.',
  pageSize = 50,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(pageSize)

  const filtered = useMemo(() => {
    if (!query.trim()) return rows
    const needle = query.trim().toLowerCase()
    return rows.filter((row) =>
      columns.some((column) =>
        String(column.value(row) ?? '')
          .toLowerCase()
          .includes(needle),
      ),
    )
  }, [rows, columns, query])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const column = columns.find((c) => c.key === sortKey)
    if (!column) return filtered

    return [...filtered].sort((a, b) => {
      const av = column.value(a)
      const bv = column.value(b)
      // I valori mancanti finiscono sempre in fondo, in entrambe le direzioni
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'it')
      return sortDesc ? -result : result
    })
  }, [filtered, columns, sortKey, sortDesc])

  const visible = sorted.slice(0, limit)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-sunken px-6 py-10 text-center text-sm text-ink-muted">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div>
      {searchable && (
        <div className="relative mb-3 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            className="input py-1.5 pl-9 text-xs"
            placeholder="Filtra..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(pageSize)
            }}
          />
        </div>
      )}

      <div className="scroll-x rounded-lg border border-surface-border">
        <table className="w-full min-w-full text-xs">
          <thead className="bg-surface-sunken">
            <tr>
              {columns.map((column) => {
                const active = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    style={{ width: column.width }}
                    className={`whitespace-nowrap px-3 py-2.5 font-semibold text-ink ${
                      column.align === 'right'
                        ? 'text-right'
                        : column.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    }`}
                  >
                    <button
                      className="inline-flex items-center gap-1 hover:text-brand"
                      onClick={() => {
                        if (active) setSortDesc(!sortDesc)
                        else {
                          setSortKey(column.key)
                          setSortDesc(true)
                        }
                      }}
                    >
                      {column.header}
                      {active &&
                        (sortDesc ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className="border-t border-surface-border align-top hover:bg-surface-sunken"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 text-ink-muted ${
                      column.align === 'right'
                        ? 'text-right tabular-nums'
                        : column.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                    }`}
                  >
                    {column.render ? column.render(row) : (column.value(row) ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-ink-faint">
        <span>
          {visible.length} di {sorted.length} righe
          {sorted.length !== rows.length && ` (${rows.length} totali)`}
        </span>
        {visible.length < sorted.length && (
          <button
            className="font-medium text-brand hover:underline"
            onClick={() => setLimit(limit + pageSize)}
          >
            Mostra altre {Math.min(pageSize, sorted.length - visible.length)}
          </button>
        )}
      </div>
    </div>
  )
}
