import { resolve } from 'path'

import { defineConfig } from 'vite'

/**
 * Chrome runs manifest content scripts as classic scripts, where an `import` statement is a
 * SyntaxError, so the bridge cannot share chunks with the service worker. This build emits it as
 * one IIFE. vite.config.ts runs it after every main build; scripts/check-content-scripts.mjs
 * checks the result.
 */
export default defineConfig(({ mode }) => ({
  build: {
    outDir: 'dist',
    // The main build has just written dist/.
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: mode !== 'production',
    lib: {
      entry: resolve(__dirname, 'src/content-scripts/heka-bridge.ts'),
      formats: ['iife'],
      name: 'hekaBridge',
      fileName: () => 'content-scripts/heka-bridge.js',
    },
  },
}))
