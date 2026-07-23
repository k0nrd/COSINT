/** Types du pont preload, visibles du renderer via `window.cosint`. */

export type MenuAction =
  | 'export-trace'
  | 'export-png'
  | 'import-trace'
  | 'open-settings'
  | 'import-csv'
  | 'export-csv'

export interface SaveResult {
  saved: boolean
  path?: string
  /** Absent si annulation par l'utilisateur ; défini en cas d'échec réel. */
  error?: 'invalid' | 'write'
}

export type OpenResult =
  | { json: string; path: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }

/** Ouverture d'un fichier texte (CSV) avec encodage détecté (§1 v1.7). */
export type OpenTextResult =
  | { text: string; path: string; encoding: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }

/** État des mises à jour automatiques (v1.3, §5). */
export type UpdateStatus =
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }

export interface CosintApi {
  openExternal: (url: string) => Promise<boolean>
  copyText: (text: string) => Promise<boolean>
  /** Copie une image (data-URL) dans le presse-papiers système (§2 v1.8.1). */
  copyImage: (dataUrl: string, text?: string) => Promise<boolean>
  getVersion: () => Promise<string>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  installUpdate: () => Promise<void>
  /** Autorise (ou non) la vérification de mise à jour GitHub (§réseau v1.7.1). */
  setUpdateCheck: (enabled: boolean) => Promise<void>
  saveTrace: (defaultName: string, json: string) => Promise<SaveResult>
  openTrace: () => Promise<OpenResult>
  savePng: (defaultName: string, dataUrl: string) => Promise<SaveResult>
  saveReport: (defaultName: string, markdown: string) => Promise<SaveResult>
  saveCsv: (defaultName: string, csv: string) => Promise<SaveResult>
  openCsv: () => Promise<OpenTextResult>
  /** §1 v1.8.7 : profil d'organisation (.cosint-org) — export/import. */
  saveOrgProfile: (defaultName: string, json: string) => Promise<SaveResult>
  openOrgProfile: () => Promise<OpenResult>
  onMenuAction: (callback: (action: MenuAction) => void) => () => void
}

declare global {
  interface Window {
    cosint: CosintApi
  }
}

export {}
