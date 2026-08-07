/**
 * Report Excel.
 *
 * Mantiene la formattazione dell'app Python: font Work Sans, header rosso
 * #E52217 su testo bianco, testo a capo, colonne dimensionate, riquadri
 * bloccati. ExcelJS non crea grafici nativi, quindi le visualizzazioni vengono
 * ricostruite come immagini PNG disegnate su canvas e incorporate nei fogli.
 */
import ExcelJS from 'exceljs'
import type { AnalysisRun, KeywordResult } from '../../types'
import { INTENT_LABELS } from '../../components/charts/Charts'

const BRAND = 'FFE52217'
const HEADER_FONT = { name: 'Work Sans', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const BODY_FONT = { name: 'Work Sans', size: 10 }

interface SheetColumn {
  header: string
  width: number
  wrap?: boolean
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn[],
  rows: (string | number | null)[][],
): ExcelJS.Worksheet {
  // Excel non ammette / \ ? * [ ] nei nomi dei fogli e li limita a 31 caratteri
  const safeName = name.replace(/[\\/?*[\]]/g, '-').slice(0, 31)
  const sheet = workbook.addWorksheet(safeName)

  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = HEADER_FONT
  headerRow.height = 24
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
  })

  for (const row of rows) {
    sheet.addRow(row.map((value) => value ?? ''))
  }

  sheet.eachRow((row, index) => {
    if (index === 1) return
    row.font = BODY_FONT
    row.alignment = { vertical: 'top', wrapText: true }
  })

  // La prima riga resta visibile durante lo scorrimento
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

  return sheet
}

// ---------------------------------------------------------------------------
// Grafici: disegnati su canvas e incorporati come immagini
// ---------------------------------------------------------------------------

interface BarDatum {
  label: string
  value: number
  highlight?: boolean
}

/**
 * Grafico a barre orizzontali su canvas. Restituisce un PNG base64 pronto per
 * `workbook.addImage`. Le etichette sono sempre scritte accanto alla barra, cosi'
 * il colore non e' l'unico canale informativo.
 */
function renderBarChartPng(title: string, data: BarDatum[], valueSuffix = ''): string | null {
  if (data.length === 0) return null

  const rowHeight = 26
  const width = 720
  const height = 60 + data.length * rowHeight + 16
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(2, 2)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#14171F'
  ctx.font = 'bold 14px "Work Sans", system-ui, sans-serif'
  ctx.fillText(title, 16, 28)

  const labelWidth = 210
  const chartLeft = 16 + labelWidth
  const chartWidth = width - chartLeft - 90
  const max = Math.max(...data.map((d) => d.value), 1)

  data.forEach((item, index) => {
    const y = 52 + index * rowHeight

    ctx.fillStyle = '#5B6472'
    ctx.font = '11px "Work Sans", system-ui, sans-serif'
    const label = item.label.length > 32 ? `${item.label.slice(0, 31)}...` : item.label
    ctx.fillText(label, 16, y + 13)

    const barWidth = Math.max((item.value / max) * chartWidth, 2)
    ctx.fillStyle = item.highlight ? '#E52217' : '#2a78d6'
    ctx.beginPath()
    ctx.roundRect(chartLeft, y + 3, barWidth, 14, [0, 4, 4, 0])
    ctx.fill()

    ctx.fillStyle = '#5B6472'
    ctx.fillText(
      `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(item.value)}${valueSuffix}`,
      chartLeft + barWidth + 8,
      y + 13,
    )
  })

  return canvas.toDataURL('image/png')
}

function embedChart(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  dataUrl: string | null,
  anchorRow: number,
  columnCount: number,
): void {
  if (!dataUrl) return
  const imageId = workbook.addImage({ base64: dataUrl, extension: 'png' })
  sheet.addImage(imageId, {
    tl: { col: 0, row: anchorRow },
    ext: { width: 720, height: 60 + columnCount * 26 + 16 },
  })
}

// ---------------------------------------------------------------------------

function ownPositionOf(result: KeywordResult): number | null {
  return result.ownSite.positions.length > 0 ? Math.min(...result.ownSite.positions) : null
}

export async function exportRunToExcel(run: AnalysisRun): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SERP Analyzer Plus Ultra'
  workbook.created = new Date()

  const completed = run.results.filter((r) => r.status === 'done')
  const aggregate = run.aggregate

  // --- Riepilogo ------------------------------------------------------------
  const summaryRows: (string | number)[][] = [
    ['Data analisi', new Date(run.startedAt).toLocaleString('it-IT')],
    ['Provider SERP', run.config.serpProvider],
    ['Provider AI', run.config.aiProvider],
    ['Modello analisi', run.config.strongModel || 'non usato'],
    ['Paese / lingua', `${run.config.country} / ${run.config.language}`],
    ['Dispositivo', run.config.device],
    ['Keyword analizzate', completed.length],
    ['Keyword in errore', run.results.filter((r) => r.status === 'error').length],
    ['Domini trovati', aggregate?.totals.domains ?? 0],
    ['Volume complessivo', aggregate?.totals.totalVolume ?? 0],
    ['Il tuo dominio', run.config.ownSiteDomain || 'non impostato'],
  ]

  if (aggregate?.ownSite) {
    summaryRows.push(
      ['Presenze in SERP', aggregate.ownSite.inSerpCount],
      ['Presenze in AI Overview', aggregate.ownSite.inAiCount],
      [
        'Posizione media',
        aggregate.ownSite.avgPosition != null ? aggregate.ownSite.avgPosition.toFixed(1) : 'n.d.',
      ],
      ['Share of Voice', `${(aggregate.ownSite.shareOfVoice * 100).toFixed(1)}%`],
      ['Traffico stimato', Math.round(aggregate.ownSite.estimatedTraffic)],
    )
  }

  if (aggregate) {
    summaryRows.push([
      'Keyword con AI Overview',
      aggregate.aiOverview.supported
        ? `${aggregate.aiOverview.keywordsWithAio} su ${aggregate.aiOverview.keywordsTotal}`
        : 'non rilevabile con il provider scelto',
    ])
  }

  addSheet(
    workbook,
    'Riepilogo',
    [
      { header: 'Voce', width: 34 },
      { header: 'Valore', width: 52 },
    ],
    summaryRows,
  )

  // --- Analisi keyword ------------------------------------------------------
  addSheet(
    workbook,
    'Analisi keyword',
    [
      { header: 'Keyword', width: 34 },
      { header: 'Volume', width: 12 },
      { header: 'Difficolta', width: 12 },
      { header: 'CPC', width: 10 },
      { header: 'Intento', width: 18 },
      { header: 'Tua posizione', width: 14 },
      { header: 'AI Overview', width: 13 },
      { header: 'Tu in AI Overview', width: 16 },
      { header: 'Fonti AI Overview', width: 16 },
      { header: 'Primo risultato', width: 26 },
      { header: 'Feature SERP', width: 34 },
      { header: 'People also ask', width: 60 },
    ],
    completed.map((result) => [
      result.keyword,
      result.metrics?.searchVolume ?? '',
      result.metrics?.difficulty ?? '',
      result.metrics?.cpc ?? '',
      result.metrics ? INTENT_LABELS[result.metrics.intent] : '',
      ownPositionOf(result) ?? 'assente',
      result.serp?.aiOverview.unsupported ? 'n.d.' : result.serp?.aiOverview.present ? 'si' : 'no',
      result.ownSite.inAiOverview ? 'si' : 'no',
      result.serp?.aiOverview.sources.length ?? 0,
      result.serp?.organic[0]?.domain ?? '',
      result.serp?.serpFeatures.join(', ') ?? '',
      result.serp?.peopleAlsoAsk.join(' | ') ?? '',
    ]),
  )

  // --- Domini e Share of Voice ---------------------------------------------
  if (aggregate) {
    const domainRows = aggregate.domains.slice(0, 60).map((domain) => [
      domain.domain,
      domain.occurrences,
      domain.keywords.length,
      domain.bestPosition,
      Number(domain.avgPosition.toFixed(1)),
      Math.round(domain.estimatedTraffic),
      Number((domain.shareOfVoice * 100).toFixed(2)),
      domain.aiOverviewCitations,
      Object.entries(domain.pageTypes)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', '),
    ])

    const domainSheet = addSheet(
      workbook,
      'Domini e Share of Voice',
      [
        { header: 'Dominio', width: 32 },
        { header: 'Presenze', width: 11 },
        { header: 'Keyword', width: 11 },
        { header: 'Miglior pos.', width: 13 },
        { header: 'Pos. media', width: 12 },
        { header: 'Traffico stimato', width: 16 },
        { header: 'Share of Voice %', width: 17 },
        { header: 'Citazioni AI Overview', width: 20 },
        { header: 'Tipologie di pagina', width: 46 },
      ],
      domainRows,
    )

    const sovData = aggregate.domains.slice(0, 12).map((domain) => ({
      label: domain.domain,
      value: Number((domain.shareOfVoice * 100).toFixed(1)),
      highlight: domain.domain === aggregate.ownSite?.domain,
    }))
    embedChart(
      workbook,
      domainSheet,
      renderBarChartPng('Share of Voice per dominio', sovData, '%'),
      domainRows.length + 3,
      sovData.length,
    )
  }

  // --- Content gap ----------------------------------------------------------
  if (aggregate && aggregate.contentGap.length > 0) {
    const gapRows = aggregate.contentGap.map((gap) => [
      gap.keyword,
      gap.opportunityScore,
      gap.searchVolume ?? '',
      gap.difficulty ?? '',
      INTENT_LABELS[gap.intent],
      gap.ownPosition ?? 'assente',
      gap.competitorsInTop10,
      gap.competitorDomains.join(', '),
    ])

    const gapSheet = addSheet(
      workbook,
      'Content gap',
      [
        { header: 'Keyword', width: 34 },
        { header: 'Punteggio opportunita', width: 20 },
        { header: 'Volume', width: 12 },
        { header: 'Difficolta', width: 12 },
        { header: 'Intento', width: 18 },
        { header: 'Tua posizione', width: 14 },
        { header: 'Competitor in top 10', width: 20 },
        { header: 'Quali competitor', width: 46 },
      ],
      gapRows,
    )

    const gapChart = aggregate.contentGap.slice(0, 12).map((gap) => ({
      label: gap.keyword,
      value: gap.opportunityScore,
    }))
    embedChart(
      workbook,
      gapSheet,
      renderBarChartPng('Migliori opportunita di content gap', gapChart),
      gapRows.length + 3,
      gapChart.length,
    )
  }

  // --- Cannibalizzazione ----------------------------------------------------
  if (aggregate && aggregate.cannibalization.length > 0) {
    addSheet(
      workbook,
      'Cannibalizzazione',
      [
        { header: 'Tipo', width: 22 },
        { header: 'Keyword', width: 30 },
        { header: 'URL coinvolti', width: 60 },
        { header: 'Posizioni', width: 14 },
        { header: 'Keyword coinvolte', width: 50 },
        { header: 'Nota', width: 60 },
      ],
      aggregate.cannibalization.map((item) => [
        item.type === 'stessa-keyword' ? 'Piu pagine, stessa query' : 'Una pagina, piu intenti',
        item.keyword ?? '',
        item.urls.join('\n'),
        item.positions.join(', '),
        item.keywords.join(', '),
        item.note,
      ]),
    )
  }

  // --- AI Overview ----------------------------------------------------------
  const aioRows = completed
    .filter((r) => r.serp?.aiOverview.present)
    .map((result) => [
      result.keyword,
      result.serp!.aiOverview.sources.length,
      result.ownSite.inAiOverview ? 'si' : 'no',
      result.ownSite.aiPosition ?? '',
      result.serp!.aiOverview.sources.map((s) => s.domain).join(', '),
      result.serp!.aiOverview.text,
    ])

  if (aioRows.length > 0) {
    const aioSheet = addSheet(
      workbook,
      'AI Overview',
      [
        { header: 'Keyword', width: 32 },
        { header: 'Numero fonti', width: 13 },
        { header: 'Tu sei citato', width: 14 },
        { header: 'Tua posizione fonti', width: 18 },
        { header: 'Domini citati', width: 50 },
        { header: 'Testo generato', width: 90 },
      ],
      aioRows,
    )

    const citedChart = (aggregate?.aiOverview.topCitedDomains ?? []).slice(0, 12).map((item) => ({
      label: item.domain,
      value: item.citations,
      highlight: item.domain === aggregate?.ownSite?.domain,
    }))
    embedChart(
      workbook,
      aioSheet,
      renderBarChartPng('Domini piu citati in AI Overview', citedChart),
      aioRows.length + 3,
      citedChart.length,
    )
  }

  // --- Analisi delle pagine in AI Overview ----------------------------------
  const analyses = completed.flatMap((r) => r.aiPageAnalyses)
  if (analyses.length > 0) {
    addSheet(
      workbook,
      'Perche vengono citate',
      [
        { header: 'Keyword', width: 28 },
        { header: 'Dominio', width: 24 },
        { header: 'URL', width: 54 },
        { header: 'Posizione nelle fonti', width: 18 },
        { header: 'Dati strutturati', width: 34 },
        { header: 'Analisi', width: 100 },
      ],
      analyses.map((analysis) => [
        analysis.keyword,
        analysis.domain,
        analysis.url,
        analysis.positionInAi,
        analysis.schemaTypes,
        analysis.analysis,
      ]),
    )
  }

  // --- Audit on-page --------------------------------------------------------
  const audits = completed.flatMap((result) =>
    result.audits.map((audit) => [
      result.keyword,
      audit.url,
      audit.domain,
      audit.ok ? audit.statusCode : (audit.error ?? 'errore'),
      audit.title,
      audit.titleLength,
      audit.metaDescriptionLength,
      audit.h1.join(' | '),
      audit.h2.length,
      audit.wordCount,
      audit.internalLinks,
      audit.externalLinks,
      audit.images,
      audit.imagesWithoutAlt,
      audit.schemaTypes.join(', '),
      audit.hasFaq ? 'si' : 'no',
      audit.hasBreadcrumbs ? 'si' : 'no',
      audit.canonical,
    ]),
  )

  if (audits.length > 0) {
    addSheet(
      workbook,
      'Audit on-page',
      [
        { header: 'Keyword', width: 26 },
        { header: 'URL', width: 54 },
        { header: 'Dominio', width: 24 },
        { header: 'Stato', width: 12 },
        { header: 'Title', width: 46 },
        { header: 'Lung. title', width: 12 },
        { header: 'Lung. meta desc', width: 15 },
        { header: 'H1', width: 40 },
        { header: 'Numero H2', width: 11 },
        { header: 'Parole', width: 10 },
        { header: 'Link interni', width: 12 },
        { header: 'Link esterni', width: 12 },
        { header: 'Immagini', width: 10 },
        { header: 'Senza alt', width: 11 },
        { header: 'Dati strutturati', width: 40 },
        { header: 'FAQ', width: 8 },
        { header: 'Breadcrumb', width: 12 },
        { header: 'Canonical', width: 48 },
      ],
      audits,
    )
  }

  // --- Cluster --------------------------------------------------------------
  if (aggregate && aggregate.clusters.length > 0) {
    addSheet(
      workbook,
      'Cluster keyword',
      [
        { header: 'Cluster', width: 32 },
        { header: 'Definito da te', width: 14 },
        { header: 'Keyword', width: 11 },
        { header: 'Volume totale', width: 14 },
        { header: 'Elenco keyword', width: 90 },
      ],
      aggregate.clusters.map((cluster) => [
        cluster.name,
        cluster.isCustom ? 'si' : 'no',
        cluster.keywords.length,
        cluster.totalVolume,
        cluster.keywords.join(', '),
      ]),
    )
  }

  // --- Domande e ricerche correlate ----------------------------------------
  if (aggregate) {
    if (aggregate.paa.length > 0) {
      addSheet(
        workbook,
        'People also ask',
        [
          { header: 'Domanda', width: 70 },
          { header: 'Keyword che la generano', width: 60 },
        ],
        aggregate.paa.map((item) => [item.question, item.keywords.join(', ')]),
      )
    }

    if (aggregate.related.length > 0) {
      addSheet(
        workbook,
        'Ricerche correlate',
        [
          { header: 'Query correlata', width: 50 },
          { header: 'Keyword che la generano', width: 60 },
        ],
        aggregate.related.map((item) => [item.query, item.keywords.join(', ')]),
      )
    }
  }

  // --- Content brief --------------------------------------------------------
  if (run.briefs.length > 0) {
    addSheet(
      workbook,
      'Content brief',
      [
        { header: 'Keyword', width: 28 },
        { header: 'H1 proposto', width: 46 },
        { header: 'Angolo', width: 50 },
        { header: 'Parole target', width: 13 },
        { header: 'Struttura', width: 80 },
        { header: 'Entita', width: 50 },
        { header: 'Domande da coprire', width: 60 },
        { header: 'Link interni', width: 40 },
      ],
      run.briefs.map((brief) => [
        brief.keyword,
        brief.h1,
        brief.angle,
        brief.targetWordCount,
        brief.outline
          .map(
            (item) =>
              `${item.level === 2 ? 'H2' : 'H3'} ${item.text}${item.note ? ` - ${item.note}` : ''}`,
          )
          .join('\n'),
        brief.entities.join(', '),
        brief.questionsToCover.join('\n'),
        brief.internalLinks.join('\n'),
      ]),
    )
  }

  // --- Download -------------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `serp-analysis-${stamp}.xlsx`
  link.click()
  // Il revoke immediato annullerebbe il download in alcuni browser
  setTimeout(() => URL.revokeObjectURL(link.href), 5000)
}
