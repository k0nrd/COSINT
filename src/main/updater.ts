/**
 * Mises à jour automatiques via GitHub Releases (v1.3, §5).
 *
 * §réseau v1.7.1 : la vérification n'est PLUS lancée inconditionnellement au
 * démarrage. Le renderer transmet la politique issue des Paramètres via
 * `update:set-check` : mode standard (case cochée) → vérification puis
 * téléchargement en arrière-plan ; mode « 100 % local » → l'appel arrive avec
 * `false` et AUCUNE requête vers GitHub n'est jamais émise. Sans appel du tout
 * (renderer pas encore chargé), rien n'est émis non plus — sûr par défaut.
 *
 * Le renderer est notifié via `update:status` (« disponible » → notification
 * discrète ; « téléchargée » → bouton « Redémarrer pour installer »). Toute
 * erreur (pas de réseau, aucune release, dépôt non configuré) est silencieuse.
 *
 * Publication : `electron-builder --publish` avec le bloc `publish` de
 * electron-builder.yml (voir README, section « Publier une mise à jour »).
 * Les données locales (IndexedDB, localStorage) vivent dans %APPDATA%/COSINT
 * et survivent aux mises à jour comme aux réinstallations.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Statut relayé au renderer — miroir du type `UpdateStatus` du preload. */
type UpdateStatusPayload =
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }

function broadcast(status: UpdateStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status)
  }
}

export function setupAutoUpdater(): void {
  // Canaux toujours enregistrés (le renderer peut les appeler sans condition) ;
  // en dev, ils ne font rien.
  ipcMain.handle('update:install', () => {
    if (app.isPackaged) autoUpdater.quitAndInstall()
  })

  // §réseau v1.7.1 : la vérification GitHub n'a lieu qu'à la demande explicite
  // du renderer (`enabled === true`, une seule fois par session). En mode
  // « 100 % local », le renderer envoie `false` → jamais aucun contact.
  let checkStarted = false
  ipcMain.handle('update:set-check', (_event, enabled: unknown) => {
    if (!app.isPackaged || enabled !== true || checkStarted) return
    checkStarted = true
    void autoUpdater.checkForUpdates().catch(() => undefined)
  })

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  // Si l'utilisateur quitte sans cliquer « Redémarrer », la mise à jour
  // téléchargée s'installe au prochain lancement.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', () => {
    /* Silencieux : hors ligne, dépôt non configuré ou aucune release. */
  })
}
