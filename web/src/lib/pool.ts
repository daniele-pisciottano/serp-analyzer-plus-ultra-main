/** Esegue i task con un limite di concorrenza, senza barriere fra un task e l'altro. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

export class AbortedError extends Error {
  constructor() {
    super('Analisi interrotta')
    this.name = 'AbortedError'
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError()
}

export function isAborted(err: unknown): boolean {
  return (
    err instanceof AbortedError ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'AbortedError'))
  )
}

/**
 * Riprova con backoff esponenziale su rate limit e errori server.
 * Gli errori 4xx (chiave sbagliata, keyword non valida) non si risolvono
 * riprovando, quindi vengono propagati subito.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { attempts = 3, baseDelayMs = 800, signal } = options
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    throwIfAborted(signal)
    try {
      return await fn()
    } catch (err) {
      if (isAborted(err)) throw err
      lastError = err

      const status = (err as { status?: number }).status
      const retryable = status == null || status === 429 || status >= 500
      if (!retryable || attempt === attempts - 1) throw err

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 250
      await sleep(delay, signal)
    }
  }

  throw lastError
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AbortedError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
