/**
 * Client AI lato browser.
 *
 * Le chiamate partono direttamente verso il provider: i tre supportano CORS e
 * cosi' non ci scontriamo con il limite di ~10s delle Netlify Functions, che
 * una singola analisi AI supera facilmente. Se la chiamata diretta fallisce per
 * motivi di rete (firewall aziendale, CORS bloccato da un'estensione),
 * ricadiamo automaticamente sulla function /api/ai, che usa lo stesso formato.
 */
import type { AiModelInfo, AiProvider, Credentials } from '../../types'
import {
  AiError,
  buildCompletionRequest,
  buildModelsRequest,
  FALLBACK_MODELS,
  parseCompletion,
  parseModels,
  type CompletionOptions,
} from './protocol'

export function apiKeyFor(provider: AiProvider, creds: Credentials): string {
  switch (provider) {
    case 'openai':
      return creds.openaiKey.trim()
    case 'anthropic':
      return creds.anthropicKey.trim()
    case 'gemini':
      return creds.geminiKey.trim()
  }
}

const PROXY_KEY_HEADER: Record<AiProvider, string> = {
  openai: 'x-openai-key',
  anthropic: 'x-anthropic-key',
  gemini: 'x-gemini-key',
}

/** Distingue "il provider ha risposto male" da "la richiesta non e' partita". */
function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError
}

async function viaProxy<T>(
  provider: AiProvider,
  apiKey: string,
  payload: Record<string, unknown>,
  pick: (data: Record<string, unknown>) => T,
): Promise<T> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [PROXY_KEY_HEADER[provider]]: apiKey,
    },
    body: JSON.stringify({ provider, ...payload }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new AiError(String(data.error ?? `Errore ${res.status} dal proxy AI`))
  return pick(data)
}

export interface CompleteArgs extends Omit<CompletionOptions, 'provider' | 'model'> {
  provider: AiProvider
  model: string
  credentials: Credentials
  signal?: AbortSignal
}

export async function complete(args: CompleteArgs): Promise<string> {
  const apiKey = apiKeyFor(args.provider, args.credentials)
  if (!apiKey) throw new AiError(`Manca la API key per ${args.provider}`)
  if (!args.model) throw new AiError(`Nessun modello selezionato per ${args.provider}`)

  const options: CompletionOptions = {
    provider: args.provider,
    model: args.model,
    system: args.system,
    prompt: args.prompt,
    maxTokens: args.maxTokens,
    jsonMode: args.jsonMode,
  }
  const request = buildCompletionRequest(options, apiKey)

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: args.signal,
    })
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const message =
        (raw.error as { message?: string } | undefined)?.message ??
        `${args.provider} ha risposto ${res.status}`
      throw new AiError(message)
    }
    return parseCompletion(args.provider, raw)
  } catch (err) {
    if (args.signal?.aborted) throw err
    if (!isNetworkFailure(err)) throw err
    // Chiamata diretta bloccata: riproviamo attraverso la nostra function
    return viaProxy(args.provider, apiKey, { action: 'complete', ...options }, (data) => {
      if (typeof data.text !== 'string') throw new AiError('Risposta del proxy AI non valida')
      return data.text
    })
  }
}

/** Come `complete`, ma restituisce JSON gia' interpretato e tollerante ai code fence. */
export async function completeJson<T>(args: CompleteArgs): Promise<T> {
  const text = await complete({ ...args, jsonMode: true })
  return parseJsonLoose<T>(text)
}

/** I modelli a volte incapsulano il JSON in un blocco markdown: lo togliamo. */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const first = cleaned.search(/[[{]/)
    const last = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T
    }
    throw new AiError('Il modello non ha restituito JSON valido')
  }
}

export async function listModels(
  provider: AiProvider,
  credentials: Credentials,
): Promise<AiModelInfo[]> {
  const apiKey = apiKeyFor(provider, credentials)
  if (!apiKey) return FALLBACK_MODELS[provider]

  const request = buildModelsRequest(provider, apiKey)
  try {
    const res = await fetch(request.url, { method: request.method, headers: request.headers })
    if (!res.ok) throw new AiError(`Elenco modelli non disponibile (${res.status})`)
    return sortModels(parseModels(provider, await res.json()))
  } catch (err) {
    if (!isNetworkFailure(err)) {
      // Chiave errata o endpoint modificato: meglio la lista di fallback che un errore bloccante
      return FALLBACK_MODELS[provider]
    }
    try {
      const models = await viaProxy(provider, apiKey, { action: 'models' }, (data) =>
        Array.isArray(data.models) ? (data.models as AiModelInfo[]) : [],
      )
      return sortModels(models)
    } catch {
      return FALLBACK_MODELS[provider]
    }
  }
}

/** I modelli "forti" in cima, poi i veloci: e' l'ordine in cui si scelgono. */
function sortModels(models: AiModelInfo[]): AiModelInfo[] {
  const weight = { strong: 0, fast: 1, other: 2 } as const
  return [...models].sort((a, b) => weight[a.tier] - weight[b.tier] || a.id.localeCompare(b.id))
}

/** Sceglie un default sensato senza fissare ID che potrebbero non esistere. */
export function pickDefaultModel(models: AiModelInfo[], tier: 'fast' | 'strong'): string {
  return models.find((m) => m.tier === tier)?.id ?? models[0]?.id ?? ''
}
