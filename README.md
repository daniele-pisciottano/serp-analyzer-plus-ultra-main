# SERP Analyzer Plus Ultra

Strumento di analisi SEO che, data una lista di keyword, interroga Google e mette insieme in un unico report: chi occupa la SERP, cosa dice e chi cita l'**AI Overview**, **volume e difficoltà** delle keyword, **Share of Voice**, **content gap**, **cannibalizzazione**, **audit on-page** dei competitor e **content brief** generati dall'AI.

È un'applicazione web pensata per girare su **Netlify**: frontend React e backend su Netlify Functions. Non ci sono account né chiavi sul server: ogni utente usa le proprie chiavi API, che restano nel suo browser.

---

## Indice

- [Primo avvio: tutorial e demo](#primo-avvio-tutorial-e-demo)
- [Cosa fa](#cosa-fa)
- [Chiavi API necessarie](#chiavi-api-necessarie)
- [Provider supportati](#provider-supportati)
- [Come si usa](#come-si-usa)
- [Come leggere i risultati](#come-leggere-i-risultati)
- [Report Excel](#report-excel)
- [Costi indicativi](#costi-indicativi)
- [Sviluppo in locale](#sviluppo-in-locale)
- [Deploy su Netlify](#deploy-su-netlify)
- [Architettura](#architettura)
- [Sicurezza delle chiavi](#sicurezza-delle-chiavi)
- [Limitazioni note](#limitazioni-note)
- [Risoluzione dei problemi](#risoluzione-dei-problemi)
- [Versione precedente (Streamlit)](#versione-precedente-streamlit)

---

## Primo avvio: tutorial e demo

**La prima volta che l'app viene aperta parte automaticamente un tutorial in 5 passi**, sopra l'interfaccia:

1. **Cosa fa questo strumento** — le analisi disponibili
2. **Le chiavi API che ti servono** — quali servono, dove trovarle, cosa sblocca ciascuna
3. **Prepara l'analisi** — dominio, cluster personalizzati, parametri di ricerca
4. **Come leggere i risultati** — le sezioni del report e la convenzione dei colori
5. **Esporta e riparti** — report Excel e content brief

Il tutorial si può saltare in qualsiasi momento. Una volta chiuso non ricompare più su quel browser, ma resta sempre disponibile dalla tab **Come funziona**.

Da ogni passo del tutorial, e dalla tab **Analisi**, si può aprire la **modalità demo**: carica un'analisi di esempio completa (12 keyword sul tema "scarpe da running") e mostra tutti i grafici, le tabelle e l'export Excel **senza inserire nessuna chiave API**. I dati della demo sono verosimili ma inventati.

> Per rivedere il tutorial come un utente nuovo: cancella i dati del sito dal browser, oppure esegui `localStorage.removeItem('spu.tutorialSeen')` nella console e ricarica la pagina.

---

## Cosa fa

Per ogni keyword l'app raccoglie e incrocia:

| Analisi | Cosa ottieni |
|---|---|
| **SERP** | Risultati organici, tipologia di ogni pagina posizionata (homepage, categoria, prodotto, articolo, servizi), People also ask, ricerche correlate, feature SERP presenti |
| **AI Overview** | Se compare, il testo generato da Google, le fonti citate e un'analisi AI del perché proprio quelle pagine vengono scelte |
| **Metriche keyword** | Volume di ricerca, CPC, keyword difficulty, intento di ricerca, andamento a 12 mesi |
| **Share of Voice** | Quota di traffico stimato per dominio sul set di keyword, con il tuo sito evidenziato |
| **Content gap** | Keyword presidiate da almeno due competitor dove tu manchi o sei sotto la terza posizione, ordinate per potenziale |
| **Cannibalizzazione** | Più pagine tue sulla stessa query, oppure una pagina che intercetta intenti di cluster diversi |
| **Audit on-page** | Title, meta description, heading, lunghezza, link, immagini senza alt e dati strutturati delle pagine posizionate, con confronto rispetto alle tue |
| **Dati strutturati** | Gli schema.org usati dai competitor (JSON-LD, anche annidato in `@graph`, e microdata): FAQ, breadcrumb, review, organization |
| **Core Web Vitals** | Performance, LCP, CLS e INP delle tue pagine da PageSpeed Insights (facoltativo) |
| **Clustering semantico** | Raggruppamento delle keyword, con priorità ai cluster che definisci tu partendo dalle pagine reali del tuo sito |
| **Content brief** | Per le keyword che scegli: H1, struttura H2/H3, entità da coprire, domande a cui rispondere, lunghezza target, link interni |
| **Report Excel** | Un foglio per ogni analisi, con i grafici principali incorporati |

---

## Chiavi API necessarie

| Chiave | Obbligatoria | A cosa serve | Dove ottenerla |
|---|---|---|---|
| **Serper** *oppure* **DataForSEO** | Sì, una delle due | Dati delle SERP | [serper.dev](https://serper.dev) · [dataforseo.com](https://dataforseo.com) |
| **DataForSEO** (login + password API) | Per le metriche keyword e l'AI Overview | Volume, difficoltà, intento, trend, AI Overview | [dataforseo.com](https://dataforseo.com) |
| **OpenAI**, **Anthropic** *oppure* **Google Gemini** | Per le funzioni AI | Classificazione pagine, clustering, analisi AI Overview, content brief | [OpenAI](https://platform.openai.com/api-keys) · [Anthropic](https://console.anthropic.com/settings/keys) · [Google AI Studio](https://aistudio.google.com/apikey) |
| **PageSpeed Insights** | No | Core Web Vitals delle tue pagine | [Guida Google](https://developers.google.com/speed/docs/insights/v5/get-started) |

Senza chiave AI l'app funziona lo stesso: basta disattivare nella configurazione classificazione AI, clustering AI e analisi AI Overview. La classificazione delle pagine usa allora solo le regole sull'URL, e il clustering un algoritmo basato sulle parole in comune.

---

## Provider supportati

### Dati SERP

| | Serper | DataForSEO |
|---|:---:|:---:|
| Risultati organici, People also ask, ricerche correlate | ✅ | ✅ |
| AI Overview strutturato (testo + fonti) | ❌ | ✅ |
| Volume, difficoltà, intento, trend | ❌ | ✅ |
| Costo indicativo per query | ~0,001 $ | ~0,002 $ |

**Serper non restituisce l'AI Overview in forma strutturata.** Con Serper selezionato, le opzioni legate all'AI Overview vengono disattivate nella configurazione con la spiegazione accanto, e la relativa sezione dei risultati lo dice esplicitamente invece di mostrare dati incompleti.

Le credenziali DataForSEO si possono usare **anche insieme a Serper**: SERP da Serper, metriche keyword da DataForSEO Labs.

### Provider AI

**OpenAI, Anthropic e Google Gemini.** L'elenco dei modelli viene letto in tempo reale dall'API del provider, quindi è sempre aggiornato. Si scelgono due modelli:

- **Modello per le analisi** — AI Overview, clustering, content brief
- **Modello veloce** — classificazione delle pagine, dove il volume di chiamate è maggiore

Se l'elenco dei modelli non è raggiungibile, per Anthropic viene proposta una lista di modelli verificati; per gli altri provider si può scrivere a mano l'ID del modello.

---

## Come si usa

1. **Configurazione** — scegli il provider SERP e quello AI, inserisci le chiavi, seleziona i modelli.
2. **Parametri di ricerca** — paese, lingua, dispositivo e numero di risultati per keyword (5–20).
3. **Il tuo dominio** — es. `miosito.it`. Abilita tracking, Share of Voice, content gap, cannibalizzazione e confronto on-page. Senza dominio queste sezioni restano vuote.
4. **Cluster personalizzati** (consigliato) — le pagine o sezioni reali del tuo sito, una per riga:
   ```
   Servizi SEO
   Corsi online
   Consulenza marketing
   Blog
   ```
   Le keyword vengono assegnate prima di tutto a questi cluster, così il report ti dice su quale pagina esistente intervenire.
5. **Cosa analizzare** — attiva o disattiva le singole analisi; ognuna in più aggiunge tempo e costo.
6. **Analisi** — incolla le keyword, una per riga (massimo 200, i duplicati vengono rimossi). Prima di partire vedi il numero di chiamate e una **stima dei costi**.
7. **Avvia analisi** — la barra di avanzamento mostra la fase in corso e le keyword in lavorazione. Il pulsante **Ferma** interrompe l'analisi e **conserva i risultati già raccolti**.

La configurazione resta salvata nel browser: la volta successiva l'analisi parte già impostata.

---

## Come leggere i risultati

In tutti i grafici vale la stessa convenzione: **blu** per il mercato e i competitor, **rosso** per il tuo sito. La palette è verificata per essere leggibile anche da chi ha deficit nella visione dei colori.

| Sezione | Contenuto |
|---|---|
| **Panoramica** | Numeri chiave, Share of Voice, distribuzione delle tue posizioni, heatmap keyword × competitor, tipologie di pagina che si posizionano |
| **Keyword** | Grafico volume/difficoltà (in alto a sinistra le occasioni migliori), intento di ricerca, stagionalità del tema, tabella di dettaglio ordinabile e filtrabile |
| **Opportunità** | Content gap ordinato per punteggio di opportunità, cannibalizzazione da risolvere |
| **AI Overview** | Copertura sul set di keyword, domini più citati, testo generato e fonti per ogni keyword, analisi del perché quelle pagine vengono citate |
| **On-page** | Le tue pagine contro la media dei top risultati, dati strutturati dei competitor, Core Web Vitals, audit pagina per pagina |
| **Cluster e domande** | Cluster di keyword con il loro volume, People also ask, ricerche correlate |
| **Content brief** | Generazione dei brief sulle keyword selezionate (quelle con un content gap sono proposte per prime), copiabili in markdown |

**Share of Voice e traffico stimato** si calcolano come volume di ricerca × CTR attesa per la posizione occupata. Senza metriche keyword la quota pesa solo le posizioni: resta confrontabile fra domini, ma non è traffico reale, e il grafico lo segnala.

---

## Report Excel

Il pulsante **Scarica report Excel** genera un file `.xlsx` con la stessa formattazione della versione originale: font Work Sans, intestazioni rosse `#E52217`, testo a capo, prima riga bloccata e filtri attivi.

| Foglio | Contenuto |
|---|---|
| Riepilogo | Parametri dell'analisi e numeri chiave |
| Analisi keyword | Una riga per keyword con metriche, posizione, AI Overview e People also ask |
| Domini e Share of Voice | Statistiche per dominio, con grafico |
| Content gap | Opportunità ordinate, con grafico |
| Cannibalizzazione | URL e keyword in conflitto |
| AI Overview | Testo e fonti per keyword, con grafico dei domini più citati |
| Perché vengono citate | Analisi AI delle pagine in AI Overview |
| Audit on-page | Tutte le metriche per pagina |
| Cluster keyword | Cluster, volume ed elenco keyword |
| People also ask · Ricerche correlate | Domande e query con le keyword che le generano |
| Content brief | Presente solo se hai generato dei brief |

I fogli senza dati vengono omessi. Le librerie Excel per il browser non creano grafici nativi, quindi i grafici sono incorporati come immagini.

---

## Costi indicativi

I costi dipendono dal piano di ogni provider; l'app mostra una stima prima di ogni analisi. Come ordine di grandezza:

| Voce | Costo |
|---|---|
| Query SERP con Serper | ~0,001 $ a keyword |
| Query SERP con DataForSEO (AI Overview incluso) | ~0,002 $ a keyword |
| Metriche keyword DataForSEO | una sola chiamata per tutte le keyword |
| Chiamate AI | dipende dal modello; le analisi AI Overview sono la voce principale |
| Audit on-page e PageSpeed Insights | gratuiti |

Per ridurre i costi: disattiva l'analisi AI Overview, riduci le pagine analizzate per keyword, usa un modello più economico come modello veloce.

---

## Sviluppo in locale

**Requisiti:** Node.js 22.

```bash
cd web
npm install
```

Poi, **dalla root del repository** (dove si trova `netlify.toml`):

```bash
npx --prefix web netlify dev
```

L'app risponde su `http://localhost:8888` e serve insieme frontend e Netlify Functions. Aprendo `http://localhost:5173` si vede solo il frontend: le analisi non funzionano perché mancano le function.

Altri comandi, da eseguire dentro `web/`:

| Comando | Cosa fa |
|---|---|
| `npm run build` | Build di produzione in `web/dist` |
| `npx tsc --noEmit` | Controllo dei tipi su frontend e function |
| `npm run dev` | Solo frontend Vite, senza function |

Per verificare la build esattamente come la farà Netlify, dalla root:

```bash
npx --prefix web netlify build --offline
```

---

## Deploy su Netlify

1. Carica il repository su GitHub.
2. Su [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub**, e scegli il repository.
3. Netlify legge la configurazione da `netlify.toml`, non serve cambiare niente:
   - base directory: `web`
   - build command: `npm run build`
   - publish directory: `dist`
   - functions: `netlify/functions`
   - Node 22
4. **Deploy.** Non servono variabili d'ambiente: le chiavi API le inserisce ogni utente nell'interfaccia.

Da quel momento ogni push sul branch principale pubblica automaticamente una nuova versione.

---

## Architettura

```
netlify.toml                 build, functions, dev server e rotte /api/*
web/
├── netlify/
│   ├── functions/           proxy stateless verso le API esterne
│   │   ├── serp.ts          1 keyword → Serper o DataForSEO, output normalizzato
│   │   ├── keyword-metrics.ts   DataForSEO Labs, fino a 700 keyword per chiamata
│   │   ├── page-fetch.ts    1 URL → audit on-page e dati strutturati
│   │   └── ai.ts            ripiego per le chiamate AI
│   └── shared/              helper HTTP e mappa dei paesi
└── src/
    ├── types.ts             contratto dati condiviso fra frontend e function
    ├── App.tsx              tab, tutorial al primo avvio, avvio dell'analisi
    ├── lib/
    │   ├── runner.ts        orchestrazione: fan-out, retry, stop, avanzamento
    │   ├── config.ts        opzioni effettive in base a provider e credenziali
    │   ├── api.ts           chiamate alle function e a PageSpeed Insights
    │   ├── ai/              formato dei tre provider AI, client e prompt
    │   ├── analysis/        Share of Voice, content gap, cannibalizzazione
    │   ├── export/excel.ts  report Excel con grafici incorporati
    │   ├── storage.ts       chiavi, configurazione e stato del tutorial
    │   └── demo.ts          dataset dimostrativo
    └── components/          tutorial, configurazione, analisi, risultati, grafici
```

**Perché il browser orchestra l'analisi.** Le Netlify Functions sincrone hanno un limite di circa 10 secondi, mentre un'analisi da 50 keyword dura minuti. Il frontend manda quindi **una keyword per chiamata** con concorrenza limitata (4 in parallelo di default), così ogni invocazione dura pochi secondi. In cambio si ottengono avanzamento reale, risultati che compaiono man mano, retry automatici sugli errori temporanei e uno stop che conserva il lavoro fatto.

**Perché le chiamate AI partono dal browser.** Una singola analisi AI supera facilmente i 10 secondi. OpenAI, Anthropic e Gemini accettano chiamate dirette dal browser, quindi l'app le fa lì, senza limiti di tempo. Se la rete le blocca (firewall aziendali, estensioni), ripiega automaticamente sulla function `/api/ai`, che usa lo stesso formato ma è soggetta al limite di 10 secondi.

**Perché servono comunque le function.** Serper e DataForSEO non accettano chiamate dirette dal browser, e scaricare le pagine dei competitor per l'audit dal browser non è possibile. Le function sono proxy senza stato: ricevono le credenziali, fanno la chiamata e restituiscono dati normalizzati.

---

## Sicurezza delle chiavi

- Le chiavi restano **nel browser dell'utente**. Di default in `sessionStorage`: spariscono chiudendo la scheda.
- Nella configurazione c'è un'opzione esplicita per **ricordarle** in `localStorage`, sconsigliata sui dispositivi condivisi, e un pulsante per cancellarle tutte.
- Verso le function viaggiano **negli header** delle richieste, mai nell'URL. Le function le usano solo per la singola chiamata al provider e non le salvano né le registrano nei log.
- Nel repository e su Netlify non c'è nessuna chiave.

---

## Limitazioni note

- **AI Overview solo con DataForSEO.** Serper non lo espone in forma strutturata.
- **Alcuni siti bloccano l'audit.** I siti con protezioni anti-bot (spesso i grandi e-commerce) rispondono con errore 403 al download della pagina. La pagina compare nell'audit come "errore" e l'analisi prosegue normalmente.
- **Ripiego AI limitato a 10 secondi.** Se le chiamate dirette dal browser sono bloccate e interviene la function `/api/ai`, le analisi più lunghe possono andare in timeout: conviene usare un modello veloce.
- **PageSpeed Insights senza chiave** ha un limite di richieste molto basso; per i Core Web Vitals è consigliato inserire la chiave gratuita. L'analisi è lenta ed è limitata a 5 pagine del tuo sito.
- **Stime, non dati reali di traffico.** Share of Voice e traffico stimato derivano da volume × CTR media per posizione: sono utili per confrontare domini, non sostituiscono Search Console.
- **Massimo 200 keyword per analisi.**

---

## Risoluzione dei problemi

| Problema | Soluzione |
|---|---|
| "Credenziali DataForSEO non valide" | Usa login e **password API** dalla dashboard DataForSEO, non la password dell'account |
| "API key Serper non valida" | Controlla la chiave su [serper.dev](https://serper.dev/api-key) |
| L'elenco dei modelli AI è vuoto | Verifica la chiave del provider; in alternativa scrivi a mano l'ID del modello |
| Le sezioni AI Overview sono vuote | Stai usando Serper: passa a DataForSEO |
| Share of Voice, content gap e cannibalizzazione sono vuoti | Imposta **Il tuo dominio** nella configurazione e rilancia l'analisi |
| Molti errori "429" o rallentamenti | Riduci le **richieste in parallelo** nella configurazione |
| In locale le analisi non partono | Apri `http://localhost:8888` (Netlify Dev), non `:5173` |
| Il tutorial non compare più | È normale dopo il primo avvio: riaprilo dalla tab **Come funziona** |

---

## Versione precedente (Streamlit)

`app.py` e `requirements.txt` sono la versione originale dell'applicazione, scritta in Python con Streamlit, che usava SerpApi e OpenAI. Sono mantenuti come riferimento e **non vengono usati dal deploy su Netlify**. Si possono rimuovere una volta che la nuova versione è stata usata su dati reali.

---

Sviluppato da Daniele, con Claude.
