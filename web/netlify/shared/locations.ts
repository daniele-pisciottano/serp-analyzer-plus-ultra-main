/**
 * Mappa paese -> parametri specifici per provider.
 * Serper ragiona per codice `gl`, DataForSEO per `location_code` numerico.
 */

export interface LocationMapping {
  label: string
  /** Codice paese usato da Serper (gl) */
  gl: string
  /** location_code DataForSEO */
  dfsLocationCode: number
  googleDomain: string
}

export const LOCATIONS: Record<string, LocationMapping> = {
  it: { label: 'Italia', gl: 'it', dfsLocationCode: 2380, googleDomain: 'google.it' },
  us: { label: 'Stati Uniti', gl: 'us', dfsLocationCode: 2840, googleDomain: 'google.com' },
  uk: { label: 'Regno Unito', gl: 'gb', dfsLocationCode: 2826, googleDomain: 'google.co.uk' },
  de: { label: 'Germania', gl: 'de', dfsLocationCode: 2276, googleDomain: 'google.de' },
  fr: { label: 'Francia', gl: 'fr', dfsLocationCode: 2250, googleDomain: 'google.fr' },
  es: { label: 'Spagna', gl: 'es', dfsLocationCode: 2724, googleDomain: 'google.es' },
  ch: { label: 'Svizzera', gl: 'ch', dfsLocationCode: 2756, googleDomain: 'google.ch' },
  at: { label: 'Austria', gl: 'at', dfsLocationCode: 2040, googleDomain: 'google.at' },
  nl: { label: 'Paesi Bassi', gl: 'nl', dfsLocationCode: 2528, googleDomain: 'google.nl' },
  pt: { label: 'Portogallo', gl: 'pt', dfsLocationCode: 2620, googleDomain: 'google.pt' },
}

export const LANGUAGES: Record<string, string> = {
  it: 'Italiano',
  en: 'English',
  de: 'Deutsch',
  fr: 'Francais',
  es: 'Espanol',
  pt: 'Portugues',
  nl: 'Nederlands',
}

export function resolveLocation(country: string): LocationMapping {
  return LOCATIONS[country] ?? LOCATIONS.it
}
