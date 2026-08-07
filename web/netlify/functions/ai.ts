/**
 * POST /api/ai
 *
 * Fallback per le chiamate AI. Normalmente il browser parla direttamente con
 * OpenAI / Anthropic / Gemini: nessun limite di timeout e streaming diretto in
 * UI. Questa function serve quando la rete dell'utente blocca quelle chiamate
 * (CORS o firewall aziendale) e usa esattamente lo stesso formato wire.
 *
 * Attenzione: essendo sincrona vale il limite di ~10s delle Netlify Functions,
 * quindi va usata con modelli veloci e `maxTokens` contenuti.
 */
import type { AiProvider } from '../../src/types'
import {
  buildCompletionRequest,
  buildModelsRequest,
  parseCompletion,
  parseModels,
} from '../../src/lib/ai/protocol'
import { fetchWithTimeout, handler, HttpError, json, readJson } from '../shared/http'

interface AiRequest {
  action: 'complete' | 'models'
  provider: AiProvider
  model?: string
  system?: string
  prompt?: string
  maxTokens?: number
  jsonMode?: boolean
}

const KEY_HEADERS: Record<AiProvider, string> = {
  openai: 'x-openai-key',
  anthropic: 'x-anthropic-key',
  gemini: 'x-gemini-key',
}

export default handler(async (req) => {
  const body = await readJson<AiRequest>(req)
  const provider = body.provider
  if (!provider || !(provider in KEY_HEADERS)) {
    throw new HttpError('Provider AI non riconosciuto', 400)
  }

  const apiKey = req.headers.get(KEY_HEADERS[provider])
  if (!apiKey) throw new HttpError(`Credenziale mancante: API key ${provider}`, 401)

  const upstream =
    body.action === 'models'
      ? buildModelsRequest(provider, apiKey)
      : buildCompletionRequest(
          {
            provider,
            model: body.model ?? '',
            system: body.system,
            prompt: body.prompt ?? '',
            maxTokens: body.maxTokens ?? 1024,
            jsonMode: body.jsonMode,
          },
          apiKey,
        )

  if (body.action === 'complete' && (!body.model || !body.prompt)) {
    throw new HttpError('Model e prompt sono obbligatori', 400)
  }

  const res = await fetchWithTimeout(upstream.url, {
    method: upstream.method,
    headers: upstream.headers,
    body: upstream.body,
    timeoutMs: 9000,
  })

  const raw = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message =
      (raw as { error?: { message?: string } }).error?.message ??
      `${provider} ha risposto ${res.status}`
    throw new HttpError(message, res.status)
  }

  return json(
    body.action === 'models'
      ? { models: parseModels(provider, raw) }
      : { text: parseCompletion(provider, raw) },
  )
})
