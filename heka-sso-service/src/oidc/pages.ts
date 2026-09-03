import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Bridge-page templates and shared static assets.
 */
const pagesDir = join(__dirname, 'pages')

export const pageAssetsDir = join(pagesDir, 'assets')

export const builtUiDir =
  basename(join(__dirname, '..')) === 'src' ? join(__dirname, '..', '..', 'dist', 'oidc', 'pages', 'ui') : join(pagesDir, 'ui')

const pagePath = (name: string): string => (name.startsWith('ui/') ? join(builtUiDir, name.slice('ui/'.length)) : join(pagesDir, name))

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
          `bridge page template '${name}' not found — the login page is a built artifact; ` + `run \`yarn ui:build\` first (${error})`
        )
      }
      throw error
    }
    cache.set(name, html)
  }
  return html
}

export function renderPage(name: string, replacements: Record<string, string> = {}): string {
  return loadPage(name).replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => replacements[key] ?? placeholder)
}
