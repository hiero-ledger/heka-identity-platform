import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { join } from 'path'

import react from '@vitejs/plugin-react'
import { build, defineConfig, type Plugin } from 'vite'

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
 * Modules that call Function(), which the extension's CSP blocks. Presentation Exchange (Ajv,
 * JSONPath) is replaced with stubs: the holder path uses DCQL. cbor-x catches the blocked call and
 * falls back by itself; its no-eval build keeps Chrome's CSP report and check:csp clean.
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

/**
 * The development build (`--mode development`) may contact localhost without asking, and injects
 * the bridge into the web UI's dev server, which the e2e harness also uses, without connecting it.
 * manifest.json is the production manifest; scripts/check-manifest.mjs checks the built one.
 */
const DEVELOPMENT_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*']

function extensionManifest(mode: string): string {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'))
  if (mode !== 'development') return JSON.stringify(manifest, null, 2)
  return JSON.stringify(
    {
      ...manifest,
      host_permissions: DEVELOPMENT_HOSTS,
      optional_host_permissions: manifest.optional_host_permissions.filter(
        (pattern: string) => !DEVELOPMENT_HOSTS.includes(pattern),
      ),
      content_scripts: [
        {
          matches: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'],
          js: ['content-scripts/heka-bridge.js'],
          run_at: 'document_idle',
        },
      ],
    },
    null,
    2,
  )
}

const copyExtensionAssets = (mode: string) => ({
  name: 'copy-extension-assets',
  writeBundle() {
    writeFileSync(resolve(__dirname, 'dist/manifest.json'), extensionManifest(mode))

    const iconsDir = resolve(__dirname, 'icons')
    const distIconsDir = resolve(__dirname, 'dist/icons')
    if (existsSync(iconsDir)) {
      mkdirSync(distIconsDir, { recursive: true })
      for (const file of readdirSync(iconsDir)) {
        copyFileSync(join(iconsDir, file), join(distIconsDir, file))
      }
    }

    // Vite names the HTML output after its input; manifest.json's default_popup is popup/index.html.
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
    copyExtensionAssets(mode),
    buildContentScript(mode),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        wallet: resolve(__dirname, 'wallet.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        // manifest.json names background/service-worker.js.
        entryFileNames: (chunk) => {
          if (chunk.name === 'popup') return 'popup/index.js'
          if (chunk.name === 'wallet') return 'wallet/index.js'
          return '[name].js'
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
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
      // Published package points "module" at a file that is not in the tarball.
      '@digitalcredentials/open-badges-context': resolve(
        __dirname,
        'node_modules/@digitalcredentials/open-badges-context/js/index.js',
      ),
      // HCS checksums call this package, whose sha256 uses Node createHash.
      '@hiero-did-sdk/crypto': resolve(__dirname, 'src/credo/browser-hedera-crypto.ts'),
    },
  },
}))
