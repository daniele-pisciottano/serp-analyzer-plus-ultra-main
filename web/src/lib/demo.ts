/**
 * Dataset dimostrativo.
 *
 * Dati verosimili ma inventati, generati in modo deterministico. Servono a far
 * vedere l'output completo senza chiedere una chiave API. Passano per le stesse
 * funzioni di aggregazione dell'analisi reale, quindi la demo non puo'
 * divergere dal prodotto vero.
 */
import { aggregate } from './analysis/aggregate'
import { clusterKeywordsSimple } from './ai/tasks'
import {
  DEFAULT_CONFIG,
  type AnalysisRun,
  type KeywordResult,
  type PageAudit,
  type SearchIntent,
} from '../types'

const OWN_DOMAIN = 'runningstore.it'

const COMPETITORS = [
  'gazzetta.it',
  'decathlon.it',
  'runnersworld.it',
  'sportler.com',
  'amazon.it',
  'cisalfasport.it',
]

interface DemoKeyword {
  keyword: string
  volume: number
  difficulty: number
  intent: SearchIntent
  ownPosition: number | null
  hasAio: boolean
  ownInAio?: boolean
}

const KEYWORDS: DemoKeyword[] = [
  {
    keyword: 'scarpe da running',
    volume: 22000,
    difficulty: 68,
    intent: 'commercial',
    ownPosition: 7,
    hasAio: true,
  },
  {
    keyword: 'migliori scarpe da running 2026',
    volume: 9900,
    difficulty: 61,
    intent: 'commercial',
    ownPosition: null,
    hasAio: true,
  },
  {
    keyword: 'scarpe running principianti',
    volume: 3600,
    difficulty: 42,
    intent: 'informational',
    ownPosition: 4,
    hasAio: true,
    ownInAio: true,
  },
  {
    keyword: 'come scegliere scarpe da corsa',
    volume: 2900,
    difficulty: 38,
    intent: 'informational',
    ownPosition: null,
    hasAio: true,
  },
  {
    keyword: 'scarpe running ammortizzate',
    volume: 1900,
    difficulty: 45,
    intent: 'commercial',
    ownPosition: 9,
    hasAio: false,
  },
  {
    keyword: 'scarpe da running offerte',
    volume: 5400,
    difficulty: 55,
    intent: 'transactional',
    ownPosition: 3,
    hasAio: false,
  },
  {
    keyword: 'scarpe trail running',
    volume: 8100,
    difficulty: 58,
    intent: 'commercial',
    ownPosition: 12,
    hasAio: false,
  },
  {
    keyword: 'differenza scarpe running e trail',
    volume: 880,
    difficulty: 24,
    intent: 'informational',
    ownPosition: null,
    hasAio: true,
  },
  {
    keyword: 'ogni quanto cambiare scarpe running',
    volume: 1300,
    difficulty: 19,
    intent: 'informational',
    ownPosition: 2,
    hasAio: true,
    ownInAio: true,
  },
  {
    keyword: 'scarpe running pronazione',
    volume: 2400,
    difficulty: 47,
    intent: 'informational',
    ownPosition: null,
    hasAio: true,
  },
  {
    keyword: 'negozio scarpe running milano',
    volume: 720,
    difficulty: 31,
    intent: 'navigational',
    ownPosition: 5,
    hasAio: false,
  },
  {
    keyword: 'scarpe running donna',
    volume: 12000,
    difficulty: 63,
    intent: 'commercial',
    ownPosition: null,
    hasAio: false,
  },
]

/** Sequenza deterministica: la demo deve essere identica a ogni apertura. */
function pseudoRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

function monthlySearches(volume: number, random: () => number) {
  const months = []
  const now = new Date('2026-08-01T00:00:00Z')
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now)
    date.setUTCMonth(date.getUTCMonth() - i)
    // Le vendite di scarpe da corsa salgono in primavera e a settembre
    const month = date.getUTCMonth() + 1
    const seasonal = [0.8, 0.85, 1.05, 1.2, 1.25, 1.1, 0.85, 0.9, 1.15, 1.05, 0.9, 0.8][month - 1]
    months.push({
      year: date.getUTCFullYear(),
      month,
      searchVolume: Math.round(volume * seasonal * (0.92 + random() * 0.16)),
    })
  }
  return months
}

function demoAudit(url: string, domain: string, isOwn: boolean, random: () => number): PageAudit {
  const words = Math.round((isOwn ? 900 : 1600) + random() * 900)
  const schemaTypes = isOwn
    ? ['Organization', 'BreadcrumbList']
    : ['Article', 'BreadcrumbList', 'FAQPage', 'Organization'].slice(
        0,
        2 + Math.floor(random() * 3),
      )

  return {
    url,
    domain,
    ok: true,
    statusCode: 200,
    title: `${domain.split('.')[0]} - guida alle scarpe da running`,
    titleLength: Math.round(48 + random() * 18),
    metaDescription: 'Guida completa alla scelta delle scarpe da running per ogni tipo di corsa.',
    metaDescriptionLength: Math.round(120 + random() * 40),
    h1: ['Scarpe da running: la guida completa'],
    h2: [
      'Come scegliere la scarpa giusta',
      'Tipi di appoggio e pronazione',
      'Ammortizzazione e drop',
      'Quando sostituire le scarpe',
      'Le migliori scarpe per categoria',
    ].slice(0, isOwn ? 3 : 5),
    h3: ['Corsa su strada', 'Corsa su sterrato', 'Gare e allenamenti'].slice(0, isOwn ? 1 : 3),
    wordCount: words,
    images: Math.round(6 + random() * 14),
    imagesWithoutAlt: Math.round(random() * (isOwn ? 6 : 2)),
    internalLinks: Math.round(18 + random() * 40),
    externalLinks: Math.round(3 + random() * 12),
    canonical: url,
    robots: 'index, follow',
    lang: 'it',
    hreflang: [],
    schemaTypes,
    hasJsonLd: true,
    hasFaq: schemaTypes.includes('FAQPage'),
    hasBreadcrumbs: schemaTypes.includes('BreadcrumbList'),
    hasReview: false,
    hasOrganization: schemaTypes.includes('Organization'),
    openGraph: { 'og:title': 'Scarpe da running' },
    textSample: '',
  }
}

export function buildDemoRun(): AnalysisRun {
  const random = pseudoRandom(20260807)

  const config = {
    ...DEFAULT_CONFIG,
    ownSiteDomain: OWN_DOMAIN,
    customClusters: [
      'Scarpe running uomo',
      'Scarpe running donna',
      'Guide alla corsa',
      'Trail running',
    ],
    serpProvider: 'dataforseo' as const,
  }

  const results: KeywordResult[] = KEYWORDS.map((item) => {
    // Costruiamo una SERP plausibile: i competitor a rotazione, noi alla posizione dichiarata
    const organic = Array.from({ length: 10 }, (_, index) => {
      const position = index + 1
      const isOwn = item.ownPosition === position
      const domain = isOwn
        ? OWN_DOMAIN
        : COMPETITORS[(index + item.keyword.length) % COMPETITORS.length]
      const slug = item.keyword.replace(/\s+/g, '-')
      return {
        position,
        title: isOwn
          ? `${item.keyword} | RunningStore`
          : `${item.keyword} - guida ${domain.split('.')[0]}`,
        link: `https://www.${domain}/${isOwn ? 'guide' : 'articoli'}/${slug}`,
        domain,
        snippet: `Tutto quello che serve sapere su ${item.keyword}, con consigli pratici e confronti.`,
        pageType:
          item.intent === 'commercial'
            ? ('Pagina di Categoria' as const)
            : item.intent === 'transactional'
              ? ('Pagina Prodotto' as const)
              : ('Articolo di Blog' as const),
      }
    })

    const aioSources = item.hasAio
      ? Array.from({ length: 4 }, (_, index) => {
          const domain =
            item.ownInAio && index === 1
              ? OWN_DOMAIN
              : COMPETITORS[(index + 2) % COMPETITORS.length]
          return {
            position: index + 1,
            title: `${item.keyword} - ${domain.split('.')[0]}`,
            link: `https://www.${domain}/${item.keyword.replace(/\s+/g, '-')}`,
            domain,
            snippet: '',
          }
        })
      : []

    const auditUrls = organic.slice(0, 5)
    const audits = auditUrls.map((entry) =>
      demoAudit(entry.link, entry.domain, entry.domain === OWN_DOMAIN, random),
    )

    return {
      keyword: item.keyword,
      status: 'done' as const,
      serp: {
        keyword: item.keyword,
        organic,
        peopleAlsoAsk: item.hasAio
          ? [
              `Quali sono le migliori scarpe per ${item.keyword.split(' ').slice(-1)[0]}?`,
              'Quanto durano le scarpe da running?',
              'Come capire se una scarpa e adatta al mio appoggio?',
            ]
          : ['Quanto costano delle buone scarpe da running?'],
        relatedSearches: [
          `${item.keyword} prezzi`,
          `${item.keyword} recensioni`,
          `${item.keyword} amazon`,
        ],
        aiOverview: {
          present: item.hasAio,
          text: item.hasAio
            ? `Per scegliere ${item.keyword} conta soprattutto il tipo di appoggio, il chilometraggio settimanale e la superficie su cui si corre. Le scarpe ammortizzate sono indicate per chi percorre lunghe distanze su asfalto, mentre modelli piu reattivi e leggeri sono adatti alle sedute veloci. La sostituzione va valutata fra gli 800 e i 1000 chilometri.`
            : '',
          sources: aioSources,
        },
        serpFeatures: [
          ...(item.hasAio ? ['AI Overview'] : []),
          'People also ask',
          'Ricerche correlate',
          ...(item.intent === 'transactional' ? ['Shopping'] : []),
        ],
        fetchedAt: '2026-08-07T09:00:00.000Z',
      },
      metrics: {
        keyword: item.keyword,
        searchVolume: item.volume,
        cpc: Math.round((0.3 + random() * 1.4) * 100) / 100,
        competition: Math.round(random() * 100) / 100,
        difficulty: item.difficulty,
        intent: item.intent,
        monthlySearches: monthlySearches(item.volume, random),
      },
      audits,
      vitals: [],
      aiPageAnalyses: item.hasAio
        ? [
            {
              keyword: item.keyword,
              url: aioSources[0].link,
              domain: aioSources[0].domain,
              title: aioSources[0].title,
              positionInAi: 1,
              analysis: `RILEVANZA\nLa pagina risponde alla query nei primi due paragrafi, con una definizione operativa invece di una premessa generica.\n\nSTRUTTURA\nGli heading sono formulati come domande dirette e ogni sezione si apre con la risposta sintetica, quindi Google puo estrarre il passaggio senza doverlo ricomporre.\n\nSEGNALI TECNICI\nSono presenti FAQPage e BreadcrumbList, il title resta sotto i 60 caratteri e le immagini hanno alt descrittivi.\n\nAUTOREVOLEZZA\nL'articolo cita test misurati e riporta autore e data di aggiornamento.\n\nAZIONI\n1. Aggiungere una risposta di due righe subito sotto ogni H2.\n2. Implementare FAQPage sulle domande gia presenti nel testo.\n3. Inserire una tabella di confronto con dati verificabili.`,
              schemaTypes: 'Article, FAQPage, BreadcrumbList',
            },
          ]
        : [],
      ownSite: {
        inSerp: item.ownPosition != null && item.ownPosition <= 10,
        positions: item.ownPosition != null && item.ownPosition <= 10 ? [item.ownPosition] : [],
        urls:
          item.ownPosition != null && item.ownPosition <= 10
            ? [`https://www.${OWN_DOMAIN}/guide/${item.keyword.replace(/\s+/g, '-')}`]
            : [],
        inAiOverview: Boolean(item.ownInAio),
        aiPosition: item.ownInAio ? 2 : null,
      },
      durationMs: Math.round(900 + random() * 1600),
    }
  })

  // Una cannibalizzazione realistica: due nostre pagine sulla stessa query
  const cannibalTarget = results.find((r) => r.keyword === 'scarpe da running offerte')
  if (cannibalTarget?.serp) {
    cannibalTarget.serp.organic[7] = {
      position: 8,
      title: 'Offerte scarpe running | RunningStore',
      link: `https://www.${OWN_DOMAIN}/promozioni/scarpe-running`,
      domain: OWN_DOMAIN,
      snippet: 'Le promozioni del mese sulle scarpe da running.',
      pageType: 'Pagina di Categoria',
    }
    cannibalTarget.ownSite.positions = [3, 8]
    cannibalTarget.ownSite.urls = [
      `https://www.${OWN_DOMAIN}/guide/scarpe-da-running-offerte`,
      `https://www.${OWN_DOMAIN}/promozioni/scarpe-running`,
    ]
  }

  const clusters = clusterKeywordsSimple(
    results.map((r) => r.keyword),
    config.customClusters,
  )

  return {
    id: 'demo',
    startedAt: '2026-08-07T09:00:00.000Z',
    finishedAt: '2026-08-07T09:04:00.000Z',
    config,
    results,
    aggregate: aggregate(results, clusters, config),
    briefs: [],
    isDemo: true,
  }
}
