/**
 * Formato wire dei tre provider AI, in un posto solo.
 *
 * Sia il client browser (src/lib/ai/client.ts) sia la function di fallback
 * (netlify/functions/ai.ts) costruiscono le richieste da qui: cosi' le
 * differenze fra provider stanno in un unico file e i prompt restano uno solo.
 */
import type { AiModelInfo, AiProvider } from '../../types'

export interface CompletionOptions {
  provider: AiProvider
  model: string
  system?: string
  prompt: string
  maxTokens: number
  /** Chiede al provider una risposta in JSON puro */
  jsonMode?: boolean
}

export interface ProviderRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Anthropic rifiuta `temperature` sui modelli attuali (Opus 5, Sonnet 5:
 * HTTP 400) e su Opus 5 il thinking e' attivo di default, quindi `max_tokens`
 * deve coprire ragionamento + risposta. Per questo non impostiamo mai
 * temperature e teniamo max_tokens generoso.
 */
export function buildCompletionRequest(opts: CompletionOptions, apiKey: string): ProviderRequest {
  switch (opts.provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
            { role: 'user', content: opts.prompt },
          ],
          // `max_completion_tokens` sostituisce `max_tokens`, deprecato e
          // rifiutato dai modelli di ragionamento.
          max_completion_tokens: opts.maxTokens,
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      }

    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Richiesto per chiamare l'API direttamente dal browser
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          ...(opts.system ? { system: opts.system } : {}),
          messages: [{ role: 'user', content: opts.prompt }],
        }),
      }

    case 'gemini':
      return {
        // La chiave viaggia nell'header, mai in querystring
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
          generationConfig: {
            maxOutputTokens: opts.maxTokens,
            ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      }
  }
}

export function buildModelsRequest(provider: AiProvider, apiKey: string): ProviderRequest {
  switch (provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/models',
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}` },
      }
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=100',
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
      }
  }
}

// ---------------------------------------------------------------------------
// Lettura delle risposte
// ---------------------------------------------------------------------------

interface OpenAiCompletion {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  error?: { message?: string }
}

interface AnthropicCompletion {
  content?: { type?: string; text?: string }[]
  stop_reason?: string
  stop_details?: { category?: string; explanation?: string }
  error?: { message?: string }
}

interface GeminiCompletion {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

export class AiError extends Error {}

export function parseCompletion(provider: AiProvider, raw: unknown): string {
  switch (provider) {
    case 'openai': {
      const data = raw as OpenAiCompletion
      if (data.error?.message) throw new AiError(data.error.message)
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new AiError('OpenAI ha restituito una risposta vuota')
      return text.trim()
    }

    case 'anthropic': {
      const data = raw as AnthropicCompletion
      if (data.error?.message) throw new AiError(data.error.message)
      // Il rifiuto arriva con HTTP 200: va controllato prima di leggere content
      if (data.stop_reason === 'refusal') {
        throw new AiError(
          `Richiesta rifiutata dai filtri di sicurezza Anthropic${
            data.stop_details?.category ? ` (${data.stop_details.category})` : ''
          }`,
        )
      }
      // I blocchi thinking hanno testo vuoto: teniamo solo quelli di tipo text
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text!)
        .join('\n')
        .trim()
      if (!text) throw new AiError('Anthropic ha restituito una risposta vuota')
      return text
    }

    case 'gemini': {
      const data = raw as GeminiCompletion
      if (data.error?.message) throw new AiError(data.error.message)
      if (data.promptFeedback?.blockReason) {
        throw new AiError(`Richiesta bloccata da Gemini (${data.promptFeedback.blockReason})`)
      }
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .trim()
      if (!text) throw new AiError('Gemini ha restituito una risposta vuota')
      return text
    }
  }
}

interface OpenAiModels {
  data?: { id?: string }[]
}
interface AnthropicModels {
  data?: { id?: string; display_name?: string }[]
}
interface GeminiModels {
  models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[]
}

/** Euristica per proporre un modello "veloce" e uno "forte" senza fissare gli ID. */
function inferTier(id: string): AiModelInfo['tier'] {
  const lower = id.toLowerCase()
  if (/(haiku|mini|nano|lite|flash|luna|small)/.test(lower)) return 'fast'
  if (/(opus|sonnet|pro|sol|terra|gpt-5|gpt-4)/.test(lower)) return 'strong'
  return 'other'
}

export function parseModels(provider: AiProvider, raw: unknown): AiModelInfo[] {
  switch (provider) {
    case 'openai': {
      const data = raw as OpenAiModels
      return (
        (data.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
          // Gli endpoint di chat non accettano embedding, audio, immagini e moderazione
          .filter(
            (id) =>
              !/(embedding|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe)/i.test(
                id,
              ),
          )
          .sort()
          .map((id) => ({ id, label: id, tier: inferTier(id) }))
      )
    }

    case 'anthropic': {
      const data = raw as AnthropicModels
      return (data.data ?? [])
        .filter((m): m is { id: string; display_name?: string } => Boolean(m.id))
        .map((m) => ({ id: m.id, label: m.display_name ?? m.id, tier: inferTier(m.id) }))
    }

    case 'gemini': {
      const data = raw as GeminiModels
      return (data.models ?? [])
        .filter((m) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const id = m.name!.replace(/^models\//, '')
          return { id, label: m.displayName ?? id, tier: inferTier(id) }
        })
        .filter((m) => !/embedding|aqa|imagen|veo/i.test(m.id))
    }
  }
}

/**
 * Elenco di fallback usato solo se la chiamata all'API dei modelli fallisce.
 * Contiene esclusivamente ID verificati: per gli altri provider la UI mostra un
 * campo libero, cosi' non proponiamo mai un ID inventato che darebbe 404.
 */
export const FALLBACK_MODELS: Record<AiProvider, AiModelInfo[]> = {
  anthropic: [
    { id: 'claude-opus-5', label: 'Claude Opus 5', tier: 'strong' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', tier: 'strong' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'fast' },
  ],
  openai: [],
  gemini: [],
}

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
}

export const PROVIDER_KEY_URLS: Record<AiProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
}
