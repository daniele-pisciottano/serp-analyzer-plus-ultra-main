/**
 * Persistenza locale di credenziali e configurazione.
 *
 * Le chiavi API stanno solo nel browser. Di default in `sessionStorage`, che si
 * svuota quando si chiude la scheda; l'utente puo' scegliere esplicitamente di
 * ricordarle in `localStorage`, con l'avviso corrispondente in UI.
 */
import { DEFAULT_CONFIG, EMPTY_CREDENTIALS, type AnalysisConfig, type Credentials } from '../types'

const CREDENTIALS_KEY = 'spu.credentials'
const CONFIG_KEY = 'spu.config'
const REMEMBER_KEY = 'spu.remember'
const TUTORIAL_KEY = 'spu.tutorialSeen'

export function isRemembering(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

function credentialStore(): Storage | null {
  try {
    return isRemembering() ? localStorage : sessionStorage
  } catch {
    return null
  }
}

export function loadCredentials(): Credentials {
  try {
    const raw = credentialStore()?.getItem(CREDENTIALS_KEY)
    if (!raw) return { ...EMPTY_CREDENTIALS }
    return { ...EMPTY_CREDENTIALS, ...(JSON.parse(raw) as Partial<Credentials>) }
  } catch {
    return { ...EMPTY_CREDENTIALS }
  }
}

export function saveCredentials(credentials: Credentials): void {
  try {
    credentialStore()?.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
  } catch {
    /* storage non disponibile (navigazione privata): le chiavi restano solo in memoria */
  }
}

export function setRemember(remember: boolean, credentials: Credentials): void {
  try {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, '1')
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
      sessionStorage.removeItem(CREDENTIALS_KEY)
    } else {
      localStorage.removeItem(REMEMBER_KEY)
      localStorage.removeItem(CREDENTIALS_KEY)
      sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
    }
  } catch {
    /* ignorato */
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(CREDENTIALS_KEY)
    localStorage.removeItem(REMEMBER_KEY)
    sessionStorage.removeItem(CREDENTIALS_KEY)
  } catch {
    /* ignorato */
  }
}

export function loadConfig(): AnalysisConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AnalysisConfig>) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AnalysisConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* ignorato */
  }
}

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1')
  } catch {
    /* ignorato */
  }
}
