/**
 * Processus principal Electron.
 * Ordre d'initialisation : sécurité (avant toute création de fenêtre),
 * IPC, menu, puis fenêtre principale.
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { setupSecurity } from './security'
import { setupIpc } from './ipc'
import { setupAutoUpdater } from './updater'
import { buildMenu } from './menu'

// Environnements sans GPU utilisable (CI, WSL) : rendu logiciel sur demande.
if (process.env['COSINT_DISABLE_GPU'] === '1') {
  app.disableHardwareAcceleration()
}

/**
 * Mode smoke-test (COSINT_SMOKE=1) : vérifie que le renderer monte réellement
 * l'application puis quitte — utilisé par la CI et les vérifications de build.
 */
function runSmokeTest(win: BrowserWindow): void {
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) console.error(`[smoke][console] ${message}`)
  })
  win.webContents.once('did-finish-load', () => {
    // Laisse à React le temps de monter, puis inspecte le DOM.
    setTimeout(() => {
      win.webContents
        .executeJavaScript(
          `(() => { const r = document.getElementById('root'); return r && r.children.length > 0 })()`
        )
        .then((mounted) => {
          console.log(mounted ? 'SMOKE_OK: renderer monté' : 'SMOKE_FAIL: #root vide')
          app.exit(mounted ? 0 : 1)
        })
        .catch((error) => {
          console.error(`SMOKE_FAIL: ${String(error)}`)
          app.exit(1)
        })
    }, 3000)
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    // Version dans le titre (§5) — maintenue aussi si la page change son titre.
    title: `COSINT ${app.getVersion()}`,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f1115',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  // Le <title> de la page ne doit pas écraser « COSINT <version> » (§5).
  win.on('page-title-updated', (event) => event.preventDefault())

  // Évite le flash blanc : la fenêtre n'apparaît qu'une fois le rendu prêt.
  win.once('ready-to-show', () => win.show())

  if (process.env['COSINT_SMOKE'] === '1') runSmokeTest(win)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  setupSecurity()
  setupIpc()
  setupAutoUpdater()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Cible Windows : quitter dès que toutes les fenêtres sont fermées.
app.on('window-all-closed', () => {
  app.quit()
})
