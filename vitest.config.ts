/**
 * Configuration Vitest (§9.5) : tests unitaires purs, exécutés sous Node
 * (aucun réseau, aucun DOM — les modules testés n'en dépendent pas).
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Version injectée comme dans le renderer (tests du contrôle de compatibilité).
  define: {
    __APP_VERSION__: JSON.stringify('1.4.0')
  },
  resolve: {
    alias: {
      // Mêmes alias que le renderer (electron.vite / tsconfig.web.json).
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Le test d'intégration P2P (deux clients) attend de vrais échanges
    // BroadcastChannel + WebCrypto : on lui laisse de la marge.
    testTimeout: 20000,
    server: {
      deps: {
        // y-webrtc maintient un registre GLOBAL de rooms par instance de
        // module. Le test d'intégration simule deux clients indépendants via
        // vi.resetModules(), qui ne réinitialise que les modules passés par le
        // pipeline Vite : on y force donc y-webrtc (un registre par client).
        inline: ['y-webrtc']
      }
    }
  }
})
