/**
 * Menu applicatif. Chaînes françaises en dur : le processus principal
 * n'a pas accès à l'i18n du renderer (v1 livrée uniquement en français).
 */
import { app, BrowserWindow, dialog, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

type MenuAction =
  | 'export-trace'
  | 'export-png'
  | 'import-trace'
  | 'open-settings'
  | 'import-csv'
  | 'export-csv'

/** Relaye une action de menu vers le renderer de la fenêtre active. */
function sendAction(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:action', action)
}

function showAbout(): void {
  const win = BrowserWindow.getFocusedWindow()
  const options = {
    type: 'info' as const,
    title: 'À propos de COSINT',
    message: 'COSINT',
    detail: `Version ${app.getVersion()}\nAucune télémétrie — les données restent sur votre poste.`
  }
  if (win) {
    void dialog.showMessageBox(win, options)
  } else {
    void dialog.showMessageBox(options)
  }
}

export function buildMenu(): void {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'Fichier',
    submenu: [
      {
        label: 'Exporter le tableau (.trace)…',
        accelerator: 'CmdOrCtrl+E',
        click: () => sendAction('export-trace')
      },
      {
        label: 'Exporter en PNG…',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => sendAction('export-png')
      },
      {
        label: 'Importer un fichier .trace…',
        accelerator: 'CmdOrCtrl+O',
        click: () => sendAction('import-trace')
      },
      { type: 'separator' },
      {
        label: 'Importer un CSV…',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => sendAction('import-csv')
      },
      {
        label: 'Exporter en CSV…',
        click: () => sendAction('export-csv')
      },
      { type: 'separator' },
      {
        label: 'Paramètres…',
        accelerator: 'CmdOrCtrl+,',
        click: () => sendAction('open-settings')
      },
      { type: 'separator' },
      { role: 'quit', label: 'Quitter' }
    ]
  }

  // Ces roles ne servent qu'aux champs texte ; l'annuler/rétablir du canvas
  // est géré au clavier par le renderer.
  const editMenu: MenuItemConstructorOptions = {
    label: 'Édition',
    submenu: [
      { role: 'undo', label: 'Annuler' },
      { role: 'redo', label: 'Rétablir' },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' },
      { role: 'copy', label: 'Copier' },
      { role: 'paste', label: 'Coller' },
      { role: 'selectAll', label: 'Tout sélectionner' }
    ]
  }

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'resetZoom', label: 'Taille réelle' },
    { role: 'zoomIn', label: 'Zoom avant' },
    { role: 'zoomOut', label: 'Zoom arrière' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Plein écran' }
  ]
  if (!app.isPackaged) {
    viewSubmenu.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Outils de développement' })
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'Affichage',
    submenu: viewSubmenu
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: 'Aide',
    submenu: [{ label: 'À propos', click: showAbout }]
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([fileMenu, editMenu, viewMenu, helpMenu]))
}
