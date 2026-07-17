/**
 * Durcissement du processus principal (§8 de la spécification, complété v1.3 §4) :
 * aucune fenêtre enfant, aucune navigation dans l'app, aucun webview, aucune
 * permission, aucun téléchargement. Les liens http(s) interceptés (window.open,
 * navigation sortante) sont REDIRIGÉS vers le navigateur externe par défaut —
 * jamais ouverts dans Electron ; tout autre schéma est simplement bloqué.
 */
import { app, session, shell } from 'electron'
import { normalizeExternalUrl } from '../shared/url'

/** Ouvre une URL dans le navigateur externe si (et seulement si) elle est http(s). */
function openExternally(url: string): void {
  const normalized = normalizeExternalUrl(url)
  if (normalized !== null) {
    void shell.openExternal(normalized).catch(() => undefined)
  }
}

export function setupSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    // window.open / target="_blank" : jamais de fenêtre Electron — le lien part
    // au navigateur externe (validé), la fenêtre est refusée dans tous les cas.
    contents.setWindowOpenHandler(({ url }) => {
      openExternally(url)
      return { action: 'deny' }
    })

    // Navigation sortante : bloquée dans l'app, redirigée vers le navigateur.
    // Seul le rechargement de l'URL déjà chargée est toléré.
    contents.on('will-navigate', (event, url) => {
      if (url !== contents.getURL()) {
        event.preventDefault()
        openExternally(url)
      }
    })

    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  })

  // Refus systématique des permissions (caméra, micro, géolocalisation, notifications…).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  // Les exports passent par des dialogues natifs (IPC) : aucun téléchargement
  // déclenché depuis le renderer n'est légitime.
  session.defaultSession.on('will-download', (event) => {
    event.preventDefault()
  })
}
