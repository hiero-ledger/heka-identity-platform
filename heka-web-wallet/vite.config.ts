import { copyFileSync, mkdirSync, readdirSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'
import { join } from 'path'

import react from '@vitejs/plugin-react'
import { build, defineConfig, type Plugin } from 'vite'

/**
 * Vite config for the Heka Web Wallet browser extension (Manifest V3).
 *
 * Entry points (one per Chrome context):
 *   - popup/index.html     → popup.html at project root (Vite HTML entry)
 *   - background/service-worker.js
 *   - content-scripts/heka-bridge.js, built separately as a classic script (vite.content-script.config.ts)
 *
 * Manifest V3 requirement: manifest.json and icons/ must be at dist/ root.
 * We handle this with a custom writeBundle Rollup plugin hook (no extra deps).
 */

/**
 * reflect-metadata falls back to Function / eval to find the global object.
 * Manifest V3 will not execute those calls. Rewrite the dead browser paths so the
 * shipped bundle does not contain them.
 */
const stripExtensionUnsafeEval = () => ({
  name: 'strip-extension-unsafe-eval',
  renderChunk(code: string) {
    const next = code
      .replaceAll('Function("return this;")()', 'globalThis')
      .replaceAll('(void 0, eval)("(function() { return this; })()")', 'undefined')
    return next === code ? null : { code: next, map: null }
  },
})

/**
 * cbor-x's default build and Ajv (via Presentation Exchange) call Function().
 * Manifest V3 rejects that at runtime. The holder path uses DCQL, so the
 * Presentation Exchange modules are replaced with stubs, and CBOR uses the
 * package's no-eval build.
 */
const cspSafeCredoModules = () => ({
  name: 'csp-safe-credo-modules',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (source === 'cbor-x') return resolve(__dirname, 'src/credo/cbor-no-eval.js')
    if (source === 'setimmediate') return resolve(__dirname, 'src/credo/setimmediate-csp.js')

    const fromPresentationExchange =
      source.includes('dif-presentation-exchange/') || (importer?.includes('/dif-presentation-exchange/') ?? false)
    if (!fromPresentationExchange) return null

    if (source === './DifPresentationExchangeService.mjs' || source.endsWith('/DifPresentationExchangeService.mjs')) {
      return resolve(__dirname, 'src/credo/dif-pex-service-stub.ts')
    }
    if (source === './models/index.mjs' || source.endsWith('dif-presentation-exchange/models/index.mjs')) {
      return resolve(__dirname, 'src/credo/pex-location-stub.ts')
    }
    if (source.endsWith('credentialSelection.mjs')) {
      return resolve(__dirname, 'src/credo/credential-selection-stub.ts')
    }
    if (source.endsWith('presentationSelection.mjs')) {
      return resolve(__dirname, 'src/credo/presentation-selection-stub.ts')
    }
    return null
  },
})

/** Builds the content script after each main build; the main build empties dist/ first, also in watch mode. */
const buildContentScript = (mode: string): Plugin => ({
  name: 'build-content-script',
  buildStart() {
    // The entry is not part of this build's module graph, so watch it explicitly.
    this.addWatchFile(resolve(__dirname, 'src/content-scripts/heka-bridge.ts'))
  },
  async writeBundle() {
    await build({ configFile: resolve(__dirname, 'vite.content-script.config.ts'), mode, logLevel: 'warn' })
  },
})

/** Inline Rollup plugin that copies static assets into dist after the build. */
const copyExtensionAssets = () => ({
  name: 'copy-extension-assets',
  writeBundle() {
    // Copy manifest.json → dist/manifest.json
    copyFileSync(resolve(__dirname, 'manifest.json'), resolve(__dirname, 'dist/manifest.json'))

    // Copy icons/ → dist/icons/  (skip silently if folder doesn't exist)
    const iconsDir = resolve(__dirname, 'icons')
    const distIconsDir = resolve(__dirname, 'dist/icons')
    if (existsSync(iconsDir)) {
      mkdirSync(distIconsDir, { recursive: true })
      for (const file of readdirSync(iconsDir)) {
        copyFileSync(join(iconsDir, file), join(distIconsDir, file))
      }
    }

    // Vite outputs the HTML entry as dist/popup.html (named after input file).
    // Chrome requires it at dist/popup/index.html (per manifest default_popup).
    const htmlSrc = resolve(__dirname, 'dist/popup.html')
    const htmlDest = resolve(__dirname, 'dist/popup/index.html')
    mkdirSync(resolve(__dirname, 'dist/popup'), { recursive: true })
    renameSync(htmlSrc, htmlDest)

    console.log('✓ manifest.json, icons, and popup/index.html ready in dist/')
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    cspSafeCredoModules(),
    stripExtensionUnsafeEval(),
    copyExtensionAssets(),
    buildContentScript(mode),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    rollupOptions: {
      input: {
        // popup.html is at project root so Vite processes it correctly
        // and outputs it to dist/popup/index.html via entryFileNames override
        popup: resolve(__dirname, 'popup.html'),
        wallet: resolve(__dirname, 'wallet.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        // Match the paths that manifest.json references exactly
        entryFileNames: (chunk) => {
          if (chunk.name === 'popup') return 'popup/index.js'
          if (chunk.name === 'wallet') return 'wallet/index.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
          // CSS for the popup → popup/index.css
          if (asset.name === 'popup.css') return 'popup/index.css'
          if (asset.name === 'wallet.css') return 'wallet/index.css'
          return 'assets/[name].[ext]'
        },
      },
    },
    // Chrome loads each context independently; no benefit from modulePreload.
    modulePreload: false,
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // @credo-ts/openid4vc imports express. The holder path never calls it.
      express: resolve(__dirname, 'src/credo/express-stub.ts'),
      // Published package points "module" at a file that is not in the tarball.
      '@digitalcredentials/open-badges-context': resolve(
        __dirname,
        'node_modules/@digitalcredentials/open-badges-context/js/index.js',
      ),
      // The package export points at the Node build. The extension only needs
      // PublicKey and the browser client while resolving did:hedera.
      '@hashgraph/sdk': resolve(__dirname, 'node_modules/@hashgraph/sdk/lib/browser.js'),
      // HCS checksums call this package, whose sha256 uses Node createHash.
      '@hiero-did-sdk/crypto': resolve(__dirname, 'src/credo/browser-hedera-crypto.ts'),
    },
  },
}))
