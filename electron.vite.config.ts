import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Version de l'application injectée dans le renderer (contrôle de compatibilité
 * des pairs, §compat v1.4). Lue depuis package.json au build. */
const APP_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8')
).version as string

/**
 * CSP stricte injectée uniquement au build de production.
 * En développement, Vite (HMR + react-refresh) a besoin de scripts inline,
 * incompatibles avec cette CSP — voir DECISIONS.md.
 */
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // wss: uniquement pour la signalisation WebRTC (voir README, section réseau)
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ')

function cspPlugin(): Plugin {
  let isBuild = false
  return {
    name: 'cosint-csp',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    transformIndexHtml(html) {
      if (!isBuild) return html
      return html.replace(
        '<!-- CSP_PLACEHOLDER -->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP_PROD}">`
      )
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // electron-updater (CommonJS, requires dynamiques) est chargé depuis
        // node_modules à l'exécution plutôt qu'empaqueté par Rollup.
        external: ['electron-updater']
      }
    }
  },
  preload: {},
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    plugins: [react(), cspPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        // Modules partagés main/renderer (validation d'URL, §4).
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
