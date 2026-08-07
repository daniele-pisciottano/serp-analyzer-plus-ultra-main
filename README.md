# SERP Analyzer Plus Ultra

Analisi SERP con AI Overview, metriche keyword, Share of Voice, content gap, cannibalizzazione e audit on-page. Applicazione web che gira su Netlify: frontend React e backend su Netlify Functions.

Le chiavi API sono dell'utente e restano nel suo browser: non c'e' nessun account da creare e nessuna credenziale sul server.

## Cosa fa

Dai una lista di keyword e per ognuna l'app interroga Google, poi mette insieme:

- **SERP**: risultati organici, tipologia di ogni pagina posizionata, People also ask, ricerche correlate, feature SERP presenti
- **AI Overview**: se compare, il testo generato, le fonti citate e un'analisi AI del perche' quelle pagine vengono scelte
- **Metriche keyword**: volume, CPC, keyword difficulty, intento di ricerca, trend a 12 mesi
- **Share of Voice**: quota di traffico stimato per dominio, con il tuo evidenziato
- **Content gap**: le keyword presidiate dai competitor dove tu manchi, ordinate per potenziale
- **Cannibalizzazione**: piu' tue pagine sulla stessa query, o una pagina che intercetta intenti diversi
- **Audit on-page**: title, meta, heading, lunghezza, link, immagini e dati strutturati delle pagine posizionate, con il confronto rispetto alle tue
- **Core Web Vitals** delle tue pagine (facoltativo, via PageSpeed Insights)
- **Clustering semantico** delle keyword, con priorita' ai cluster che definisci tu
- **Content brief** generati dall'AI sulle keyword che selezioni
- **Report Excel** con un foglio per analisi e i grafici inclusi come immagini

C'e' una **modalita' demo** con un dataset di esempio: mostra l'output completo senza inserire nessuna chiave.

## Provider supportati

### Dati SERP

| | Serper | DataForSEO |
|---|:---:|:---:|
| Risultati organici, PAA, ricerche correlate | si | si |
| AI Overview strutturato (testo + fonti) | **no** | si |
| Volume, difficolta', intento, trend | **no** | si |
| Costo indicativo per query | ~0,001 $ | ~0,002 $ |

**Serper non espone l'AI Overview**: con Serper selezionato le sezioni AI Overview restano vuote e l'app lo dice esplicitamente invece di mostrare dati incompleti. Le credenziali DataForSEO possono essere usate anche insieme a Serper, se vuoi le SERP da Serper e le sole metriche keyword da DataForSEO.

### Provider AI

OpenAI, Anthropic e Google Gemini. L'elenco dei modelli viene letto a runtime dall'API del provider, quindi non invecchia: si sceglie un modello "per le analisi" (AI Overview, clustering, brief) e uno "veloce" (classificazione delle pagine).

Le chiamate AI partono direttamente dal browser verso il provider. Non passano da una Netlify Function perche' una singola analisi supera facilmente il limite di ~10 secondi delle function sincrone. Se la rete blocca le chiamate dirette, l'app ricade automaticamente sulla function `/api/ai`, che usa lo stesso formato.

## Sviluppo in locale

```bash
cd web && npm install
```

```bash
npx netlify dev
```

Va lanciato dalla **root del repository** (dove sta `netlify.toml`), non da `web/`. Il server risponde su `http://localhost:8888` e serve sia il frontend sia le function.

Altri comandi, da `web/`:

```bash
npm run build
```

```bash
npx tsc --noEmit
```

## Deploy su Netlify

1. Collega il repository a un sito Netlify.
2. La configurazione e' gia' in `netlify.toml`: base `web`, build `npm run build`, publish `dist`, functions `web/netlify/functions`.
3. Non servono variabili d'ambiente: le chiavi API le inserisce l'utente nell'interfaccia.

## Struttura

```
netlify.toml                 configurazione build, functions e dev
web/
├── netlify/
│   ├── functions/           proxy stateless verso le API di terzi
│   │   ├── serp.ts          1 keyword -> Serper o DataForSEO, output normalizzato
│   │   ├── keyword-metrics.ts  DataForSEO Labs, batch fino a 700 keyword
│   │   ├── page-fetch.ts    1 URL -> audit on-page e dati strutturati
│   │   └── ai.ts            fallback per le chiamate AI
│   └── shared/              helper HTTP e mappa dei paesi
├── public/_redirects        fallback SPA (solo sul sito pubblicato)
└── src/
    ├── types.ts             contratto dati condiviso con le function
    ├── lib/
    │   ├── runner.ts        orchestrazione: fan-out, retry, stop, progressi
    │   ├── api.ts           chiamate alle function + PageSpeed Insights
    │   ├── ai/              protocollo dei tre provider, client e prompt
    │   ├── analysis/        Share of Voice, content gap, cannibalizzazione
    │   ├── export/excel.ts  report Excel con grafici incorporati
    │   └── demo.ts          dataset dimostrativo
    └── components/          tutorial, configurazione, analisi, risultati, grafici
```

### Come viene gestito il tempo di esecuzione

Le Netlify Functions sincrone hanno un limite di circa 10 secondi, mentre un'analisi da 50 keyword dura minuti. Il fan-out lo fa quindi il browser: `runner.ts` manda una keyword per chiamata con concorrenza limitata, cosi' ogni invocazione resta di pochi secondi. In cambio si ottengono progressi reali, risultati che compaiono man mano e un pulsante di stop che conserva quello che e' gia' stato raccolto.

## Sicurezza delle chiavi

Le chiavi restano nel browser. Di default in `sessionStorage`, quindi spariscono chiudendo la scheda; c'e' un'opzione esplicita per ricordarle in `localStorage`, sconsigliata su un dispositivo condiviso. Verso le function viaggiano negli header, mai in querystring, e le function le usano solo per la singola chiamata in uscita senza salvarle ne' loggarle.

## Versione precedente

`app.py` e' l'applicazione Streamlit originale, mantenuta come riferimento. Usava SerpApi e OpenAI e girava su Streamlit Cloud. Puo' essere rimossa una volta che la nuova versione ha girato su dati reali.
