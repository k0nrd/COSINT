/**
 * Preload strict (§8) : seul ce pont minimal est exposé au renderer.
 * contextIsolation: true, sandbox: true — aucun accès Node côté renderer.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

export type MenuAction =
  | 'export-trace'
  | 'export-png'
  | 'import-trace'
  | 'open-settings'
  | 'import-csv'
  | 'export-csv'

type SaveResult = { saved: boolean; path?: string; error?: 'invalid' | 'write' }
type OpenResult =
  | { json: string; path: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }
type OpenTextResult =
  | { text: string; path: string; encoding: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }

/** État des mises à jour automatiques relayé par le main (v1.3, §5). */
export type UpdateStatus =
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }

const api = {
  /** Ouvre une URL http(s) dans le navigateur externe — jamais dans l'app (§8).
   * L'URL est normalisée côté main (préfixe https:// si absent, §4). */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('app:open-external', url),

  /** Copie un texte dans le presse-papiers via le processus principal (§2). */
  copyText: (text: string): Promise<boolean> => ipcRenderer.invoke('app:copy-text', text),

  /** Copie une IMAGE (data-URL) dans le presse-papiers système (§2 v1.8.1), pour la
   * coller dans un autre document. `text` optionnel = fragment COSINT posé en plus
   * (le collage dans l'appli garde la pleine fidélité). */
  copyImage: (dataUrl: string, text?: string): Promise<boolean> =>
    ipcRenderer.invoke('app:copy-image', { dataUrl, text }),

  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /** Abonnement à l'état des mises à jour automatiques (§5). */
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus): void => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },

  /** Redémarre l'application pour installer la mise à jour téléchargée (§5). */
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),

  /** Politique de vérification des mises à jour (§réseau v1.7.1) : la
   * vérification GitHub n'est lancée que si le renderer l'autorise (jamais en
   * mode 100 % local). Sans appel, AUCUNE requête n'est émise. */
  setUpdateCheck: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('update:set-check', enabled),

  /** Dialogue « Enregistrer sous » pour un fichier .trace. */
  saveTrace: (defaultName: string, json: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save-trace', { defaultName, json }),

  /** Dialogue « Ouvrir » pour un fichier .trace. */
  openTrace: (): Promise<OpenResult> => ipcRenderer.invoke('file:open-trace'),

  /** Dialogue « Enregistrer sous » pour l'export PNG (data-URL). */
  savePng: (defaultName: string, dataUrl: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save-png', { defaultName, dataUrl }),

  /** Dialogue « Enregistrer sous » pour le rapport des sources (Markdown). */
  saveReport: (defaultName: string, markdown: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save-report', { defaultName, markdown }),

  /** Dialogue « Enregistrer sous » pour un export CSV (§1 v1.7). */
  saveCsv: (defaultName: string, csv: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save-csv', { defaultName, csv }),

  /** Dialogue « Ouvrir » pour un fichier CSV (encodage détecté côté main). */
  openCsv: (): Promise<OpenTextResult> => ipcRenderer.invoke('file:open-csv'),

  /** §1 v1.8.7 : Dialogue « Enregistrer sous » pour un profil d'organisation (.cosint-org). */
  saveOrgProfile: (defaultName: string, json: string): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save-org-profile', { defaultName, json }),

  /** §1 v1.8.7 : Dialogue « Ouvrir » pour un profil d'organisation (.cosint-org). */
  openOrgProfile: (): Promise<OpenResult> => ipcRenderer.invoke('file:open-org-profile'),

  /** Abonnement aux actions du menu applicatif ; retourne le désabonnement. */
  onMenuAction: (callback: (action: MenuAction) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, action: MenuAction): void => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  }
}

export type CosintApi = typeof api

contextBridge.exposeInMainWorld('cosint', api)
