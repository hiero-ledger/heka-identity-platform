import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bridge-page templates and shared static assets (INTEGRATION.md P2.10.1).
 *
 * The four HTML documents the bridge serves (wallet login page, logout
 * confirmation, post-logout, error) live as plain `.html` files in
 * `src/oidc/pages/`, next to the shared stylesheet + logo in
 * `pages/assets/` (served at `/interaction/assets/*` by
 * `InteractionAssetsController`). `nest build` copies the whole directory
 * into `dist/oidc/pages` (nest-cli.json `assets`), so a deployment re-brands
 * by editing HTML/CSS — or volume-mounting over `dist/oidc/pages` in Docker —
 * without a rebuild.
 *
 * Templates are loaded once (boot-time cache) and use `{{key}}` placeholders.
 * Substitution values are inserted verbatim: the caller escapes what needs
 * escaping (`{{form}}` is the library's XSRF form and MUST stay verbatim;
 * `{{host}}`/`{{details}}` are pre-escaped by the provider hooks).
 */
const pagesDir = join(__dirname, 'pages')

/** Directory of the shared static assets (stylesheet, logo). */
export const pageAssetsDir = join(pagesDir, 'assets')

const cache = new Map<string, string>()

export function loadPage(name: string): string {
  let html = cache.get(name)
  if (html === undefined) {
    html = readFileSync(join(pagesDir, name), 'utf8')
    cache.set(name, html)
  }
  return html
}

/** Renders a template, replacing each `{{key}}` with its (caller-escaped) value. */
export function renderPage(name: string, replacements: Record<string, string> = {}): string {
  return loadPage(name).replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => replacements[key] ?? placeholder)
}
