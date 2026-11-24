import { resolve } from 'path'

import { defineConfig } from 'vite'

/**
 * Chrome runs manifest content scripts as classic scripts, where an `import` statement is a
 * SyntaxError. In the main build the bridge shared modules with the service worker, so Rollup
 * emitted it with `import` from `chunks/` and it never ran. This build emits it as one IIFE with
 * those modules inlined. vite.config.ts runs it after every main build (also in watch mode), and
 * scripts/check-content-scripts.mjs checks the result.
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
