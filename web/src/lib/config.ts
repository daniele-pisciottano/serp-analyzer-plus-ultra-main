/**
 * Configurazione effettiva.
 *
 * L'utente puo' lasciare attiva un'opzione che il provider scelto non supporta
 * (l'AI Overview con Serper) o per cui mancano le credenziali. La UI la mostra
 * disattivata: questa funzione applica le stesse regole al valore usato per
 * validare, stimare i costi ed eseguire l'analisi, cosi' i tre non divergono.
 */
import { SERP_CAPABILITIES, type AnalysisConfig, type Credentials } from '../types'

export function resolveConfig(config: AnalysisConfig, credentials: Credentials): AnalysisConfig {
  const capabilities = SERP_CAPABILITIES[config.serpProvider]
  const hasDataForSeo = Boolean(
    credentials.dataforseoLogin.trim() && credentials.dataforseoPassword.trim(),
  )

  return {
    ...config,
    enableAiOverviewAnalysis: config.enableAiOverviewAnalysis && capabilities.aiOverview,
    // Le metriche vengono sempre da DataForSEO Labs, anche con le SERP di Serper
    enableKeywordMetrics: config.enableKeywordMetrics && hasDataForSeo,
    enableCoreWebVitals: config.enableCoreWebVitals && Boolean(config.ownSiteDomain.trim()),
  }
}

/** Vero se, con la configurazione effettiva, serve davvero un provider AI. */
export function needsAi(config: AnalysisConfig): boolean {
  return config.useAiClassification || config.enableClustering || config.enableAiOverviewAnalysis
}
