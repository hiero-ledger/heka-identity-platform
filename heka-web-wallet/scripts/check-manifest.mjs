import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The production manifest asks for no http access and injects no content script: the holder
// grants each https origin and connects each site at run time. Each permission it keeps must be
// used by the bundle, found by the API the permission unlocks.
const PERMISSION_USES = {
  storage: 'chrome.storage',
  scripting: 'chrome.scripting',
  // Opening the popup grants the active tab's URL, which chrome.tabs.query returns.
  activeTab: 'chrome.tabs.query',
  alarms: 'chrome.alarms',
  notifications: 'chrome.notifications',
  offscreen: 'chrome.offscreen',
  tabs: 'chrome.tabs',
}

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

function walk(directory) {
  const files = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else if (name.endsWith('.js')) files.push(path)
  }
  return files
}

let manifest
let bundle
try {
  manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  bundle = walk(dist)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
} catch {
  console.error('dist/manifest.json is missing. Run yarn build first.')
  process.exit(1)
}

const failures = []
for (const pattern of manifest.host_permissions ?? []) {
  if (/^(http|\*):/.test(pattern) || pattern === '<all_urls>') {
    failures.push(`host_permissions grants http access at install: ${pattern}`)
  }
}
if ((manifest.content_scripts ?? []).length > 0) {
  failures.push('content_scripts injects the bridge without the holder connecting a site')
}
for (const permission of manifest.permissions ?? []) {
  const use = PERMISSION_USES[permission]
  if (!use) failures.push(`permissions: no usage check for "${permission}"; add one to scripts/check-manifest.mjs`)
  else if (!bundle.includes(use)) failures.push(`permissions: "${permission}" is unused (no ${use} in dist/)`)
}

if (failures.length > 0) {
  console.error('Manifest check failed. dist/manifest.json is not a production manifest:')
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Manifest check passed (permissions: ${(manifest.permissions ?? []).join(', ')}).`)
