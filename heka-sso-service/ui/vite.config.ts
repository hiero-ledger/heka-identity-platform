import { defineConfig } from 'vite'

/**
 * The wallet login page build (INTEGRATION.md P2.10.2).
 *
 * Output goes into `src/oidc/pages/ui/` (gitignored), next to the hand-authored
 * P2.10.1 templates: the bridge serves `ui/login.html` via `loadPage` and the
 * built assets via `/interaction/assets/*` (`InteractionAssetsController`
 * resolves that route against `pages/ui` first, then `pages/assets`; the
 * extension whitelist keeps `login.html` itself unexposed there).
 * `nest build` then copies the whole `pages/` tree into `dist/`.
 *
 * File names are pinned (no content hashes): the three provider-hook templates
 * link the same built stylesheet by name (`styles.css`), and stable names keep
 * the Docker volume-mount branding story (P2.10.1) working. Cache headers stay
 * short (`max-age=300`) for the same reason.
 *
 * `base` makes every emitted URL absolute under the bridge's asset route — the
 * page is served at `/interaction/:uid`, so relative URLs would break.
 */
export default defineConfig({
  base: '/interaction/assets/',
  build: {
    outDir: '../src/oidc/pages/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: 'login.html',
      output: {
        // flat, pinned names at the outDir root — `base` already carries the
        // /interaction/assets/ URL prefix, so no assets/ subdirectory here
        entryFileNames: 'login.js',
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? ''
          return name.endsWith('.css') ? 'styles.css' : '[name][extname]'
        },
      },
    },
  },
})
