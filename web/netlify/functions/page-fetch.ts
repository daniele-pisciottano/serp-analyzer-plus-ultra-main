/**
 * POST /api/page-fetch
 *
 * Scarica una pagina e ne estrae audit on-page e dati strutturati.
 * Un solo URL per chiamata, con timeout a 7s: e' il parallelismo del browser a
 * fare volume, non la singola invocazione.
 *
 * Sostituisce `fetch_page_content` + `extract_structured_data` dell'app Python.
 */
import * as cheerio from 'cheerio'
import type { PageAudit } from '../../src/types'
import {
  cleanText,
  domainOf,
  fetchWithTimeout,
  handler,
  HttpError,
  json,
  readJson,
  truncate,
} from '../shared/http'

interface PageFetchRequest {
  url: string
  /** Quanto testo restituire per le analisi AI. 0 = niente testo. */
  textSampleChars?: number
}

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
}

function emptyAudit(url: string, error: string, statusCode = 0): PageAudit {
  return {
    url,
    domain: domainOf(url),
    ok: false,
    error,
    statusCode,
    title: '',
    titleLength: 0,
    metaDescription: '',
    metaDescriptionLength: 0,
    h1: [],
    h2: [],
    h3: [],
    wordCount: 0,
    images: 0,
    imagesWithoutAlt: 0,
    internalLinks: 0,
    externalLinks: 0,
    canonical: '',
    robots: '',
    lang: '',
    hreflang: [],
    schemaTypes: [],
    hasJsonLd: false,
    hasFaq: false,
    hasBreadcrumbs: false,
    hasReview: false,
    hasOrganization: false,
    openGraph: {},
    textSample: '',
  }
}

/** Estrae ricorsivamente i valori di @type da un blocco JSON-LD, incluso @graph. */
function collectSchemaTypes(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((child) => collectSchemaTypes(child, acc))
    return
  }
  if (!node || typeof node !== 'object') return

  const obj = node as Record<string, unknown>
  const type = obj['@type']
  if (typeof type === 'string') acc.add(type)
  else if (Array.isArray(type)) type.forEach((t) => typeof t === 'string' && acc.add(t))

  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'hasPart']) {
    if (obj[key]) collectSchemaTypes(obj[key], acc)
  }
}

export default handler(async (req) => {
  const body = await readJson<PageFetchRequest>(req)
  if (!body.url) throw new HttpError('URL mancante', 400)

  let target: URL
  try {
    target = new URL(body.url)
  } catch {
    throw new HttpError('URL non valido', 400)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpError('Sono ammessi solo URL http/https', 400)
  }

  let res: Response
  try {
    res = await fetchWithTimeout(target.toString(), {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      timeoutMs: 7000,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore di rete'
    return json(emptyAudit(body.url, message))
  }

  if (!res.ok) {
    return json(emptyAudit(body.url, `HTTP ${res.status}`, res.status))
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) {
    return json(emptyAudit(body.url, `Contenuto non HTML (${contentType})`, res.status))
  }

  const html = await res.text()
  const $ = cheerio.load(html)
  const finalUrl = res.url || target.toString()
  const host = new URL(finalUrl).hostname

  // Dati strutturati: JSON-LD (incluso @graph) piu' i tipi dichiarati via microdata.
  // Vanno letti PRIMA di rimuovere gli script: il JSON-LD vive dentro un tag
  // <script>, e la pulizia qui sotto lo cancellerebbe insieme al JavaScript.
  const schemaTypes = new Set<string>()
  let hasJsonLd = false
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim()
    if (!raw) return
    try {
      collectSchemaTypes(JSON.parse(raw), schemaTypes)
      hasJsonLd = true
    } catch {
      /* JSON-LD malformato sulla pagina del competitor: non e' un errore nostro */
    }
  })
  $('[itemtype]').each((_, el) => {
    const itemtype = $(el).attr('itemtype')
    if (itemtype) schemaTypes.add(itemtype.split('/').pop() ?? itemtype)
  })

  $('script, style, noscript, svg, iframe').remove()

  const title = cleanText($('title').first().text())
  const metaDescription = cleanText($('meta[name="description"]').attr('content'))
  const bodyText = cleanText($('body').text())
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0

  const images = $('img')
  const imagesWithoutAlt = images.filter((_, el) => !$(el).attr('alt')?.trim()).length

  let internalLinks = 0
  let externalLinks = 0
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    try {
      const resolved = new URL(href, finalUrl)
      if (resolved.hostname === host) internalLinks += 1
      else externalLinks += 1
    } catch {
      /* href malformato: ignorato */
    }
  })

  const schemaList = [...schemaTypes]
  const schemaLower = schemaList.map((s) => s.toLowerCase())
  const hasType = (needle: string) => schemaLower.some((s) => s.includes(needle))

  const openGraph: Record<string, string> = {}
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property')
    const content = $(el).attr('content')
    if (property && content) openGraph[property] = cleanText(content)
  })

  const hreflang: string[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const value = $(el).attr('hreflang')
    if (value) hreflang.push(value)
  })

  const headings = (selector: string) =>
    $(selector)
      .map((_, el) => cleanText($(el).text()))
      .get()
      .filter(Boolean)
      .slice(0, 30)

  const audit: PageAudit = {
    url: finalUrl,
    domain: domainOf(finalUrl),
    ok: true,
    statusCode: res.status,
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    h1: headings('h1'),
    h2: headings('h2'),
    h3: headings('h3'),
    wordCount,
    images: images.length,
    imagesWithoutAlt,
    internalLinks,
    externalLinks,
    canonical: cleanText($('link[rel="canonical"]').attr('href')),
    robots: cleanText($('meta[name="robots"]').attr('content')),
    lang: cleanText($('html').attr('lang')),
    hreflang,
    schemaTypes: schemaList,
    hasJsonLd,
    hasFaq: hasType('faq') || hasType('question'),
    hasBreadcrumbs: hasType('breadcrumb'),
    hasReview: hasType('review') || hasType('aggregaterating'),
    hasOrganization: hasType('organization') || hasType('localbusiness'),
    openGraph,
    textSample: body.textSampleChars ? truncate(bodyText, body.textSampleChars) : '',
  }

  return json(audit)
})
