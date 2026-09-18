/**
 * Compiti AI dell'applicazione.
 *
 * Ogni funzione qui dentro e' indipendente dal provider: costruisce il prompt,
 * chiede una risposta in JSON e la valida. Se il modello risponde male, il
 * chiamante riceve un errore chiaro invece di dati silenziosamente sbagliati.
 */
import type {
  AiProvider,
  ContentBrief,
  Credentials,
  KeywordCluster,
  PageAudit,
  PageType,
} from '../../types'
import { PAGE_TYPES } from '../../types'
import { complete, completeJson } from './client'

export interface AiContext {
  provider: AiProvider
  fastModel: string
  strongModel: string
  credentials: Credentials
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Classificazione tipologia pagina
// ---------------------------------------------------------------------------

/**
 * Porting di `classify_page_type_rule_based`: risolve la maggior parte dei casi
 * senza chiamare l'AI. Restituisce null quando serve il modello.
 */
export function classifyByRules(url: string, title: string): PageType | null {
  const u = url.toLowerCase()
  const t = title.toLowerCase()

  let path = ''
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }

  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0 || t.includes('homepage') || t.includes('home page')) return 'Homepage'

  const match = (patterns: string[]) => patterns.some((p) => u.includes(p))

  if (match(['/prodotto', '/product', '/p/', '/item', '/acquista', '/buy']))
    return 'Pagina Prodotto'
  if (
    match([
      '/categoria',
      '/category',
      '/catalogo',
      '/catalog',
      '/collection',
      '/collezione',
      '/prodotti',
      '/products',
    ])
  )
    return 'Pagina di Categoria'
  if (
    match([
      '/blog',
      '/news',
      '/notizie',
      '/magazine',
      '/articolo',
      '/article',
      '/post',
      '/guide',
      '/guida',
    ])
  )
    return 'Articolo di Blog'
  if (
    match([
      '/servizi',
      '/services',
      '/service',
      '/consulenza',
      '/consulting',
      '/soluzioni',
      '/solutions',
    ])
  )
    return 'Pagina di Servizi'

  return null
}

interface ClassificationResponse {
  results: { url: string; type: string }[]
}

/**
 * Classifica in un'unica chiamata tutte le pagine che le regole non coprono.
 * L'app Python faceva una chiamata per pagina: qui il batch riduce di molto
 * costo e latenza.
 */
export async function classifyPagesWithAi(
  pages: { url: string; title: string }[],
  ctx: AiContext,
): Promise<Map<string, PageType>> {
  const out = new Map<string, PageType>()
  if (pages.length === 0) return out

  const BATCH = 40
  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH)
    const list = batch
      .map((p, idx) => `${idx + 1}. URL: ${p.url}\n   Titolo: ${p.title}`)
      .join('\n')

    const data = await completeJson<ClassificationResponse>({
      provider: ctx.provider,
      model: ctx.fastModel,
      credentials: ctx.credentials,
      signal: ctx.signal,
      maxTokens: 4000,
      system:
        'Sei un analista SEO. Classifichi pagine web nella loro tipologia osservando URL e titolo. Rispondi solo con JSON.',
      prompt: `Classifica ogni pagina in una di queste categorie: ${PAGE_TYPES.join(', ')}.

Pagine:
${list}

Rispondi con questo JSON:
{"results": [{"url": "<url esatto ricevuto>", "type": "<una delle categorie>"}]}`,
    })

    for (const item of data.results ?? []) {
      const type = PAGE_TYPES.find((t) => t.toLowerCase() === (item.type ?? '').toLowerCase())
      if (item.url && type) out.set(item.url, type)
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Clustering semantico
// ---------------------------------------------------------------------------

interface ClusterResponse {
  clusters: { name: string; keywords: string[] }[]
}

/**
 * Porting di `cluster_keywords_with_custom`: i cluster personalizzati (le
 * pagine reali del sito) hanno priorita' assoluta, i nuovi si creano solo se
 * una keyword non ci sta dentro.
 */
export async function clusterKeywords(
  keywords: string[],
  customClusters: string[],
  ctx: AiContext,
): Promise<KeywordCluster[]> {
  if (keywords.length === 0) return []

  const merged = new Map<string, Set<string>>()
  const BATCH = 60

  for (let i = 0; i < keywords.length; i += BATCH) {
    const batch = keywords.slice(i, i + BATCH)

    const customBlock = customClusters.length
      ? `Cluster predefiniti, corrispondono a pagine esistenti del sito. Assegna qui ogni keyword semanticamente compatibile:
${customClusters.map((c) => `- ${c}`).join('\n')}

Crea un cluster nuovo solo per le keyword che non appartengono a nessuno dei predefiniti.`
      : 'Non ci sono cluster predefiniti: raggruppa le keyword per intento e argomento.'

    const data = await completeJson<ClusterResponse>({
      provider: ctx.provider,
      model: ctx.strongModel,
      credentials: ctx.credentials,
      signal: ctx.signal,
      maxTokens: 6000,
      system:
        'Sei un esperto di architettura dell’informazione e analisi semantica. Raggruppi keyword per affinita’ di argomento e intento di ricerca. Rispondi solo con JSON.',
      prompt: `${customBlock}

Ogni keyword va assegnata a esattamente un cluster. I cluster nuovi devono avere almeno 3 keyword; quelle che restano isolate vanno in "Generale".

Keyword:
${batch.map((k) => `- ${k}`).join('\n')}

Rispondi con questo JSON:
{"clusters": [{"name": "<nome cluster>", "keywords": ["<keyword esatta>"]}]}`,
    })

    for (const cluster of data.clusters ?? []) {
      if (!cluster.name) continue
      const set = merged.get(cluster.name) ?? new Set<string>()
      for (const kw of cluster.keywords ?? []) {
        // Riportiamo alla keyword originale: il modello a volte cambia le maiuscole
        const original = keywords.find((k) => k.toLowerCase() === String(kw).toLowerCase())
        if (original) set.add(original)
      }
      merged.set(cluster.name, set)
    }
  }

  const customLower = customClusters.map((c) => c.toLowerCase())
  return [...merged.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([name, set]) => ({
      name,
      keywords: [...set],
      isCustom: customLower.includes(name.toLowerCase()),
      totalVolume: 0, // riempito dall'aggregatore quando ci sono le metriche
    }))
    .sort(
      (a, b) => Number(b.isCustom) - Number(a.isCustom) || b.keywords.length - a.keywords.length,
    )
}

/** Fallback senza AI: raggruppa per parola in comune. Porting di `cluster_keywords_simple`. */
const MIN_AUTO_CLUSTER_SIZE = 3

const STOP_WORDS = new Set([
  'come',
  'cosa',
  'quale',
  'quali',
  'quanto',
  'ogni',
  'alla',
  'alle',
  'dalla',
  'della',
  'delle',
  'degli',
  'nella',
  'sulla',
  'per',
  'con',
  'del',
  'the',
  'and',
  'with',
  'migliore',
  'migliori',
])

/** Parole che portano significato: lunghe almeno 4 lettere e non funzionali. */
function significantTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
}

/**
 * Confronto tollerante alle desinenze: "guida" e "guide", "scarpa" e "scarpe",
 * "donna" e "donne" devono coincidere. Oltre le 4 lettere si ignora l'ultima.
 */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 5 || b.length < 5) return false
  return a.slice(0, -1) === b.slice(0, -1)
}

export function clusterKeywordsSimple(
  keywords: string[],
  customClusters: string[],
): KeywordCluster[] {
  const clusters = new Map<string, string[]>()
  const unassigned: string[] = []

  // Una parola condivisa da piu' cluster ("scarpe" in "Scarpe uomo" e "Scarpe
  // donna") non dice a quale dei due appartiene la keyword: pesiamo quindi ogni
  // parola per quanto e' rara fra i nomi dei cluster, come un IDF.
  const clusterTerms = customClusters.map((name) => ({ name, terms: significantTerms(name) }))
  const documentFrequency = new Map<string, number>()
  for (const { terms } of clusterTerms) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }
  const weight = (term: string) =>
    Math.log((customClusters.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 0.1

  for (const keyword of keywords) {
    const tokens = significantTerms(keyword)
    const scored = clusterTerms
      .map(({ name, terms }) => ({
        name,
        score: terms
          .filter((term) => tokens.some((token) => sameStem(token, term)))
          .reduce((sum, term) => sum + weight(term), 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    // A parita' di punteggio la keyword e' ambigua ("scarpe da running" fra
    // uomo e donna): meglio lasciarla ai cluster automatici che sbagliare.
    const [best, second] = scored
    if (best && (!second || best.score - second.score > 1e-9)) {
      clusters.set(best.name, [...(clusters.get(best.name) ?? []), keyword])
    } else {
      unassigned.push(keyword)
    }
  }

  // Le restanti vengono raggruppate sulla parola piu' lunga condivisa
  for (const keyword of unassigned) {
    const head = significantTerms(keyword)[0] ?? 'Generale'
    const name = head.charAt(0).toUpperCase() + head.slice(1)
    clusters.set(name, [...(clusters.get(name) ?? []), keyword])
  }

  // Stessa regola del clustering AI: un cluster automatico sotto le 3 keyword non
  // descrive un argomento, quindi le sue keyword confluiscono in "Generale".
  // I cluster personalizzati restano anche se piccoli: sono pagine reali del sito.
  const customLower = customClusters.map((c) => c.toLowerCase())
  const isCustom = (name: string) => customLower.includes(name.toLowerCase())
  const general: string[] = []
  for (const [name, kws] of [...clusters.entries()]) {
    if (!isCustom(name) && kws.length < MIN_AUTO_CLUSTER_SIZE) {
      general.push(...kws)
      clusters.delete(name)
    }
  }
  if (general.length > 0) {
    clusters.set('Generale', [...(clusters.get('Generale') ?? []), ...general])
  }

  return [...clusters.entries()].map(([name, kws]) => ({
    name,
    keywords: kws,
    isCustom: isCustom(name),
    totalVolume: 0,
  }))
}

// ---------------------------------------------------------------------------
// Analisi di una pagina citata in AI Overview
// ---------------------------------------------------------------------------

/** Porting di `analyze_page_content_for_ai_overview`, con i dati dell'audit gia' pronti. */
export async function analyzeAiOverviewPage(
  keyword: string,
  audit: PageAudit,
  ctx: AiContext,
): Promise<string> {
  const headings = [
    ...audit.h1.map((h) => `H1: ${h}`),
    ...audit.h2.slice(0, 12).map((h) => `H2: ${h}`),
    ...audit.h3.slice(0, 8).map((h) => `H3: ${h}`),
  ].join('\n')

  return complete({
    provider: ctx.provider,
    model: ctx.strongModel,
    credentials: ctx.credentials,
    signal: ctx.signal,
    maxTokens: 4000,
    system:
      'Sei un consulente SEO senior. Analizzi perche’ una pagina viene citata come fonte nell’AI Overview di Google e indichi come replicare quel risultato.',
    prompt: `Query: "${keyword}"
URL: ${audit.url}

STRUTTURA
${headings || '(nessun heading rilevato)'}

DATI TECNICI
- Title (${audit.titleLength} caratteri): ${audit.title}
- Meta description (${audit.metaDescriptionLength} caratteri): ${audit.metaDescription || '(assente)'}
- Parole nel contenuto: ${audit.wordCount}
- Dati strutturati: ${audit.schemaTypes.join(', ') || 'nessuno'}
- Link interni: ${audit.internalLinks} / esterni: ${audit.externalLinks}
- Immagini: ${audit.images} (senza alt: ${audit.imagesWithoutAlt})

CONTENUTO
${audit.textSample}

Scrivi un'analisi in italiano, massimo 400 parole, con queste sezioni:
1. RILEVANZA - perche' questo contenuto risponde alla query
2. STRUTTURA - come e' organizzato e come favorisce l'estrazione da parte di Google
3. SEGNALI TECNICI - dati strutturati, metadati, elementi multimediali
4. AUTOREVOLEZZA - segnali di affidabilita' presenti
5. AZIONI - 3 interventi concreti per posizionare una pagina simile

Niente preamboli, vai direttamente alle sezioni.`,
  })
}

// ---------------------------------------------------------------------------
// Content brief
// ---------------------------------------------------------------------------

interface BriefResponse {
  h1?: string
  angle?: string
  outline?: { level?: number; text?: string; note?: string }[]
  entities?: string[]
  questionsToCover?: string[]
  targetWordCount?: number
  internalLinks?: string[]
}

export async function generateBrief(
  input: {
    keyword: string
    searchVolume: number | null
    intent: string
    competitorTitles: string[]
    competitorHeadings: string[]
    avgWordCount: number
    peopleAlsoAsk: string[]
    relatedSearches: string[]
    customClusters: string[]
    aiOverviewText: string
  },
  ctx: AiContext,
): Promise<ContentBrief> {
  const data = await completeJson<BriefResponse>({
    provider: ctx.provider,
    model: ctx.strongModel,
    credentials: ctx.credentials,
    signal: ctx.signal,
    maxTokens: 6000,
    system:
      'Sei un content strategist SEO. Costruisci brief editoriali operativi partendo dall’analisi della SERP. Rispondi solo con JSON.',
    prompt: `Crea il brief per un contenuto che deve posizionarsi sulla keyword "${input.keyword}".

DATI DELLA SERP
- Volume di ricerca: ${input.searchVolume ?? 'non disponibile'}
- Intento: ${input.intent}
- Lunghezza media dei competitor: ${input.avgWordCount} parole
- Titoli dei competitor:
${input.competitorTitles.map((t) => `  - ${t}`).join('\n') || '  (nessuno)'}
- Heading usati dai competitor:
${
  input.competitorHeadings
    .slice(0, 40)
    .map((h) => `  - ${h}`)
    .join('\n') || '  (nessuno)'
}
- Domande "People also ask":
${input.peopleAlsoAsk.map((q) => `  - ${q}`).join('\n') || '  (nessuna)'}
- Ricerche correlate:
${input.relatedSearches.map((q) => `  - ${q}`).join('\n') || '  (nessuna)'}
${input.aiOverviewText ? `- Contenuto dell'AI Overview:\n${input.aiOverviewText.slice(0, 1500)}` : ''}
${input.customClusters.length ? `- Pagine del sito a cui si puo' linkare:\n${input.customClusters.map((c) => `  - ${c}`).join('\n')}` : ''}

Il brief deve battere i competitor, non copiarli: indica dove aggiungere information gain.

Rispondi con questo JSON:
{
  "h1": "<titolo H1 proposto>",
  "angle": "<in una frase, l'angolo che differenzia il contenuto>",
  "outline": [{"level": 2, "text": "<heading>", "note": "<cosa scrivere in questa sezione>"}],
  "entities": ["<entita' o concetto da citare>"],
  "questionsToCover": ["<domanda a cui rispondere esplicitamente>"],
  "targetWordCount": <numero>,
  "internalLinks": ["<pagina del sito da linkare>"]
}`,
  })

  return {
    keyword: input.keyword,
    h1: data.h1 ?? input.keyword,
    angle: data.angle ?? '',
    outline: (data.outline ?? [])
      .filter((item) => item.text)
      .map((item) => ({
        level: item.level === 3 ? 3 : 2,
        text: item.text!,
        note: item.note,
      })),
    entities: data.entities ?? [],
    questionsToCover: data.questionsToCover ?? [],
    targetWordCount: data.targetWordCount ?? Math.max(input.avgWordCount, 800),
    internalLinks: data.internalLinks ?? [],
  }
}
