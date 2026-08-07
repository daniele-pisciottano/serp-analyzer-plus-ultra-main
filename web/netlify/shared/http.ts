/**
 * Helper condivisi dalle Netlify Functions.
 *
 * Le function sono proxy stateless: ricevono le credenziali dell'utente negli
 * header della richiesta, chiamano l'API di terze parti e restituiscono dati
 * normalizzati. Nessuna credenziale viene salvata o loggata.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error: message, ...extra }, status)
}

/** Errore che la function puo' propagare al client con uno status specifico. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message)
  }
}

/** Wrapper che trasforma le eccezioni in risposte JSON coerenti. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
    try {
      return await fn(req)
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status)
      const message = err instanceof Error ? err.message : 'Errore sconosciuto'
      return fail(message, 500)
    }
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  if (req.method !== 'POST') throw new HttpError('Metodo non consentito, usa POST', 405)
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError('Body della richiesta non contiene JSON valido', 400)
  }
}

/** Legge un header obbligatorio, con messaggio d'errore comprensibile in UI. */
export function requireHeader(req: Request, name: string, label: string): string {
  const value = req.headers.get(name)
  if (!value) throw new HttpError(`Credenziale mancante: ${label}`, 401)
  return value
}

/** fetch con timeout: nessuna chiamata deve avvicinarsi al limite della function. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new HttpError(`Timeout dopo ${timeoutMs}ms chiamando ${new URL(url).host}`, 504)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Estrae il dominio da un URL, senza il www. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Regex costruite da escape ASCII: U+2028/U+2029 spezzano le righe in modo
// invisibile e i caratteri di controllo fanno fallire i parser JSON dei provider AI.
const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g')
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g')

/** Rimuove caratteri di controllo che rompono la serializzazione JSON e le API AI. */
export function cleanText(input: unknown): string {
  if (input == null) return ''
  return String(input)
    .replace(LINE_SEPARATORS, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Tronca preservando la parola, per i testi che finiscono nei prompt AI. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut) + '...'
}
