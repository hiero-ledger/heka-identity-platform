import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Bridge-page templates and shared static assets.
 *
 * The four HTML documents the bridge serves (wallet login page, logout
 * confirmation, post-logout, error) live as plain `.html` files in
 * `src/oidc/pages/`, next to the shared stylesheet + logo in
 * `pages/assets/` (served at `/interaction/assets/*` by
 * `InteractionAssetsController`). `nest build` copies the whole directory
 * into `dist/oidc/pages` (nest-cli.json `assets`), where the Vite login-page
 * build also emits into `pages/ui`, so a deployment re-brands by
 * editing HTML/CSS — or volume-mounting over `dist/oidc/pages` in Docker —
 * without a rebuild.
 *
 * Templates are loaded once (boot-time cache) and use `{{key}}` placeholders.
 * Substitution values are inserted verbatim: the caller escapes what needs
 * escaping (`{{form}}` is the library's XSRF form and MUST stay verbatim;
 * `{{host}}`/`{{details}}` are pre-escaped by the provider hooks).
 */
const pagesDir = join(__dirname, 'pages')

/** Directory of the hand-authored shared static assets (logo). */
export const pageAssetsDir = join(pagesDir, 'assets')

/**
 * Vite build output of the login page (`yarn ui:build`), emitted
 * straight into `dist/oidc/pages/ui`. Compiled, that is this module's own
 * `pages/ui`; under vitest the module runs from `src/`, so the built output is
 * found in the sibling `dist` tree instead.
 */
export const builtUiDir =
  basename(join(__dirname, '..')) === 'src'
    ? join(__dirname, '..', '..', 'dist', 'oidc', 'pages', 'ui')
    : join(pagesDir, 'ui')

/** Resolves a template name: `ui/*` lives in the built output, the rest in `pages/`. */
const pagePath = (name: string): string =>
  name.startsWith('ui/') ? join(builtUiDir, name.slice('ui/'.length)) : join(pagesDir, name)

/**
 * Roots the asset route serves from, first hit wins: the built UI output
 * (`login.js`, `styles.css`) shadows the hand-authored assets dir (`logo.svg`).
 */
export const pageAssetRoots = [builtUiDir, pageAssetsDir]

const cache = new Map<string, string>()

export function loadPage(name: string): string {
  let html = cache.get(name)
  if (html === undefined) {
    try {
      html = readFileSync(pagePath(name), 'utf8')
    } catch (error) {
      if (name.startsWith('ui/')) {
        throw new Error(
          `bridge page template '${name}' not found — the login page is a built artifact; ` +
            `run \`yarn ui:build\` first (${error})`,
        )
      }
      throw error
    }
    cache.set(name, html)
  }
  return html
}

/** Renders a template, replacing each `{{key}}` with its (caller-escaped) value. */
export function renderPage(name: string, replacements: Record<string, string> = {}): string {
  return loadPage(name).replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => replacements[key] ?? placeholder)
}
