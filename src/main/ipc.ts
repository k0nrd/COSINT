/**
 * Canaux IPC du processus principal — miroir exact du pont preload.
 * Règle : jamais de throw non géré ; toute erreur ou entrée invalide
 * se traduit par un retour neutre ({ saved: false }, null ou false).
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { win32, join } from 'node:path'
import { normalizeExternalUrl } from '../shared/url'
import { checkServer, discoverServer, type DiscoveredServer } from './discovery'

/** Taille maximale acceptée pour un fichier .trace importé (256 Mo). */
const MAX_TRACE_BYTES = 256 * 1024 * 1024

/** §1 v1.8.7 : un profil d'organisation (.cosint-org) est minuscule — 256 Ko suffisent. */
const MAX_ORG_PROFILE_BYTES = 256 * 1024

/** Plafond des données écrites côté main (symétrie avec la lecture). */
const MAX_WRITE_BYTES = 256 * 1024 * 1024

/** Longueur maximale d'un texte copiable dans le presse-papiers (1 Mo). */
const MAX_CLIPBOARD_LENGTH = 1024 * 1024

/**
 * Sécurise le nom de fichier proposé par le renderer (zone NON fiable sous
 * sandbox) : on ne retient qu'un nom de base assaini, avec l'extension attendue,
 * ancré dans le dossier Documents. Empêche un renderer compromis de pré-pointer
 * un dialogue « Enregistrer sous » vers un chemin/nom/extension arbitraires.
 */
function safeDefaultPath(defaultName: string, allowedExt: string[]): string {
  // win32.basename retire aussi les séparateurs Windows d'un chemin POSIX
  // (assainissement volontairement strict, quel que soit l'OS hôte).
  let base = win32
    .basename(defaultName)
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>| \u0000-\u001f\u202a-\u202e\u2066-\u2069-]+/g, "-")
    .slice(0, 80)
    .trim()
  if (base === '' || base === '.' || base === '..') base = 'tableau'
  // Noms de périphériques Windows réservés (CON, PRN, NUL, COM1…, LPT1…).
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `fichier-${base}`
  const lower = base.toLowerCase()
  if (!allowedExt.some((ext) => lower.endsWith(`.${ext}`))) {
    base += `.${allowedExt[0]}`
  }
  // Assemblage final avec le séparateur NATIF de l'OS (`/` sous Linux/macOS,
  // `\` sous Windows) — `win32.join` produirait un backslash cassé sous Linux.
  return join(app.getPath('documents'), base)
}

const TRACE_FILTERS = [
  { name: 'Tableau COSINT', extensions: ['trace'] },
  { name: 'JSON', extensions: ['json'] }
]

const PNG_FILTERS = [{ name: 'Image PNG', extensions: ['png'] }]
const MD_FILTERS = [{ name: 'Markdown', extensions: ['md'] }]
const CSV_FILTERS = [{ name: 'CSV', extensions: ['csv'] }]
const ORG_PROFILE_FILTERS = [
  { name: "Profil d'organisation COSINT", extensions: ['cosint-org', 'json'] }
]

/**
 * Décode un buffer de CSV en détectant l'encodage par son BOM (§1 v1.7) : UTF-16 LE/BE
 * ou UTF-8 (avec ou sans BOM). Défaut UTF-8. Retourne le texte et l'encodage détecté.
 */
function decodeCsvBuffer(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.toString('utf16le'), encoding: 'UTF-16 LE' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16 BE : Node ne le décode pas directement → on inverse les octets.
    // `swap16` exige une longueur PAIRE (sinon RangeError) : on écarte un octet
    // orphelin final plutôt que de refuser tout le fichier.
    const even = buffer.length % 2 === 0 ? buffer : buffer.subarray(0, buffer.length - 1)
    const swapped = Buffer.from(even)
    swapped.swap16()
    return { text: swapped.toString('utf16le'), encoding: 'UTF-16 BE' }
  }
  return { text: buffer.toString('utf8'), encoding: 'UTF-8' }
}

/** Fenêtre à laquelle rattacher les dialogues natifs (celle qui appelle). */
function windowOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function setupIpc(): void {
  // §4 (v1.3) : normalisation partagée (préfixe https:// si absent) et
  // validation stricte http/https — `file:`, `javascript:`… ne sont jamais ouverts.
  ipcMain.handle('app:open-external', async (_event, url: unknown): Promise<boolean> => {
    const normalized = normalizeExternalUrl(url)
    if (normalized === null) return false
    try {
      await shell.openExternal(normalized)
      return true
    } catch {
      return false
    }
  })

  // §1 v1.8.9 : le renderer ne peut pas émettre de HTTP (CSP `connect-src ws: wss:`).
  // Ces deux canaux lui permettent de VÉRIFIER que son serveur de signalisation est
  // bien à l'adresse enregistrée, et sinon de le RETROUVER sur le réseau local (cas
  // du serveur en DHCP dont l'adresse change). Le jeton ne circule jamais ici : le
  // renderer n'envoie qu'une empreinte non réversible qui en est dérivée.
  ipcMain.handle(
    'net:check-server',
    async (_event, payload: unknown): Promise<boolean> => {
      const p = payload as { host?: unknown; port?: unknown; expectedId?: unknown }
      if (
        typeof p?.host !== 'string' ||
        typeof p?.port !== 'number' ||
        typeof p?.expectedId !== 'string'
      ) {
        return false
      }
      try {
        return await checkServer(p.host, p.port, p.expectedId)
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(
    'net:discover-server',
    async (_event, payload: unknown): Promise<DiscoveredServer | null> => {
      const p = payload as { port?: unknown; expectedId?: unknown }
      if (typeof p?.port !== 'number' || typeof p?.expectedId !== 'string') return null
      try {
        return await discoverServer(p.port, p.expectedId)
      } catch {
        return null
      }
    }
  )

  // §2 (v1.3) : copie via l'API clipboard du processus principal — fiable sous
  // sandbox, contrairement à navigator.clipboard (permissions/focus du renderer).
  ipcMain.handle('app:copy-text', (_event, text: unknown): boolean => {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_CLIPBOARD_LENGTH) {
      return false
    }
    try {
      clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  })

  // §2 v1.8.1 : copie d'une IMAGE (bitmap) dans le presse-papiers système, afin de
  // la coller dans un autre document (traitement de texte, messagerie…). `text`
  // optionnel = fragment COSINT posé EN PLUS de l'image (write multi-format) : le
  // collage DANS l'appli garde alors la pleine fidélité (nœud), tandis qu'un logiciel
  // externe reçoit le bitmap. Retour neutre (false) sur toute donnée invalide.
  ipcMain.handle('app:copy-image', (_event, payload: unknown): boolean => {
    if (typeof payload !== 'object' || payload === null) return false
    const { dataUrl, text } = payload as { dataUrl?: unknown; text?: unknown }
    if (
      typeof dataUrl !== 'string' ||
      !dataUrl.startsWith('data:image/') ||
      dataUrl.length > MAX_WRITE_BYTES
    ) {
      return false
    }
    try {
      const image = nativeImage.createFromDataURL(dataUrl)
      if (image.isEmpty()) return false
      if (typeof text === 'string' && text.length > 0 && text.length <= MAX_CLIPBOARD_LENGTH) {
        clipboard.write({ text, image })
      } else {
        clipboard.writeImage(image)
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('app:version', (): string => app.getVersion())

  ipcMain.handle(
    'file:save-trace',
    async (event, payload: unknown): Promise<SaveResult> => {
      if (typeof payload !== 'object' || payload === null) return { saved: false, error: 'invalid' }
      const { defaultName, json } = payload as { defaultName?: unknown; json?: unknown }
      if (typeof defaultName !== 'string' || typeof json !== 'string') {
        return { saved: false, error: 'invalid' }
      }
      if (Buffer.byteLength(json, 'utf8') > MAX_WRITE_BYTES) return { saved: false, error: 'write' }
      try {
        const win = windowOf(event)
        const options = {
          defaultPath: safeDefaultPath(defaultName, ['trace', 'json']),
          filters: TRACE_FILTERS
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { saved: false }
        await writeFile(result.filePath, json, 'utf8')
        return { saved: true, path: result.filePath }
      } catch {
        return { saved: false, error: 'write' }
      }
    }
  )

  ipcMain.handle('file:open-trace', async (event): Promise<OpenResult> => {
    let path: string | undefined
    try {
      const win = windowOf(event)
      const options = { filters: TRACE_FILTERS, properties: ['openFile' as const] }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      path = result.filePaths[0]
      if (result.canceled || !path) return { canceled: true }
    } catch {
      return { canceled: true }
    }
    try {
      const info = await stat(path)
      if (info.size > MAX_TRACE_BYTES) return { error: 'too-large' }
      const json = await readFile(path, 'utf8')
      return { json, path }
    } catch {
      return { error: 'read' }
    }
  })

  ipcMain.handle(
    'file:save-png',
    async (event, payload: unknown): Promise<SaveResult> => {
      if (typeof payload !== 'object' || payload === null) return { saved: false, error: 'invalid' }
      const { defaultName, dataUrl } = payload as { defaultName?: unknown; dataUrl?: unknown }
      const prefix = 'data:image/png;base64,'
      if (
        typeof defaultName !== 'string' ||
        typeof dataUrl !== 'string' ||
        !dataUrl.startsWith(prefix)
      ) {
        return { saved: false, error: 'invalid' }
      }
      if (dataUrl.length > MAX_WRITE_BYTES) return { saved: false, error: 'write' }
      const bytes = Buffer.from(dataUrl.slice(prefix.length), 'base64')
      if (bytes.length === 0) return { saved: false, error: 'invalid' }
      try {
        const win = windowOf(event)
        const options = {
          defaultPath: safeDefaultPath(defaultName, ['png']),
          filters: PNG_FILTERS
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { saved: false }
        await writeFile(result.filePath, bytes)
        return { saved: true, path: result.filePath }
      } catch {
        return { saved: false, error: 'write' }
      }
    }
  )

  // ——— CSV (§1 v1.7) ———
  ipcMain.handle(
    'file:save-csv',
    async (event, payload: unknown): Promise<SaveResult> => {
      if (typeof payload !== 'object' || payload === null) return { saved: false, error: 'invalid' }
      const { defaultName, csv } = payload as { defaultName?: unknown; csv?: unknown }
      if (typeof defaultName !== 'string' || typeof csv !== 'string') {
        return { saved: false, error: 'invalid' }
      }
      if (Buffer.byteLength(csv, 'utf8') > MAX_WRITE_BYTES) return { saved: false, error: 'write' }
      try {
        const win = windowOf(event)
        const options = { defaultPath: safeDefaultPath(defaultName, ['csv']), filters: CSV_FILTERS }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { saved: false }
        await writeFile(result.filePath, csv, 'utf8')
        return { saved: true, path: result.filePath }
      } catch {
        return { saved: false, error: 'write' }
      }
    }
  )

  ipcMain.handle('file:open-csv', async (event): Promise<OpenTextResult> => {
    let path: string | undefined
    try {
      const win = windowOf(event)
      const options = { filters: CSV_FILTERS, properties: ['openFile' as const] }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      path = result.filePaths[0]
      if (result.canceled || !path) return { canceled: true }
    } catch {
      return { canceled: true }
    }
    try {
      const info = await stat(path)
      if (info.size > MAX_TRACE_BYTES) return { error: 'too-large' }
      const buffer = await readFile(path)
      const { text, encoding } = decodeCsvBuffer(buffer)
      return { text, path, encoding }
    } catch {
      return { error: 'read' }
    }
  })

  // ——— §1 v1.8.7 : profil d'organisation (.cosint-org) — export/import ———
  ipcMain.handle(
    'file:save-org-profile',
    async (event, payload: unknown): Promise<SaveResult> => {
      if (typeof payload !== 'object' || payload === null) return { saved: false, error: 'invalid' }
      const { defaultName, json } = payload as { defaultName?: unknown; json?: unknown }
      if (typeof defaultName !== 'string' || typeof json !== 'string') {
        return { saved: false, error: 'invalid' }
      }
      if (Buffer.byteLength(json, 'utf8') > MAX_ORG_PROFILE_BYTES) {
        return { saved: false, error: 'write' }
      }
      try {
        const win = windowOf(event)
        const options = {
          defaultPath: safeDefaultPath(defaultName, ['cosint-org', 'json']),
          filters: ORG_PROFILE_FILTERS
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { saved: false }
        await writeFile(result.filePath, json, 'utf8')
        return { saved: true, path: result.filePath }
      } catch {
        return { saved: false, error: 'write' }
      }
    }
  )

  ipcMain.handle('file:open-org-profile', async (event): Promise<OpenResult> => {
    let path: string | undefined
    try {
      const win = windowOf(event)
      const options = { filters: ORG_PROFILE_FILTERS, properties: ['openFile' as const] }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      path = result.filePaths[0]
      if (result.canceled || !path) return { canceled: true }
    } catch {
      return { canceled: true }
    }
    try {
      const info = await stat(path)
      if (info.size > MAX_ORG_PROFILE_BYTES) return { error: 'too-large' }
      const json = await readFile(path, 'utf8')
      return { json, path }
    } catch {
      return { error: 'read' }
    }
  })

  ipcMain.handle(
    'file:save-report',
    async (event, payload: unknown): Promise<SaveResult> => {
      if (typeof payload !== 'object' || payload === null) return { saved: false, error: 'invalid' }
      const { defaultName, markdown } = payload as { defaultName?: unknown; markdown?: unknown }
      if (typeof defaultName !== 'string' || typeof markdown !== 'string') {
        return { saved: false, error: 'invalid' }
      }
      if (Buffer.byteLength(markdown, 'utf8') > MAX_WRITE_BYTES) return { saved: false, error: 'write' }
      try {
        const win = windowOf(event)
        const options = {
          defaultPath: safeDefaultPath(defaultName, ['md']),
          filters: MD_FILTERS
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return { saved: false }
        await writeFile(result.filePath, markdown, 'utf8')
        return { saved: true, path: result.filePath }
      } catch {
        return { saved: false, error: 'write' }
      }
    }
  )
}

/** Résultat d'une sauvegarde : succès, annulation (error absent) ou échec. */
type SaveResult = { saved: boolean; path?: string; error?: 'invalid' | 'write' }
/** Résultat d'une ouverture : contenu, annulation ou échec typé. */
type OpenResult =
  | { json: string; path: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }
/** Résultat d'une ouverture de fichier texte (CSV) avec encodage détecté (§1 v1.7). */
type OpenTextResult =
  | { text: string; path: string; encoding: string }
  | { canceled: true }
  | { error: 'too-large' | 'read' }
