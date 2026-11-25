import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The production manifest grants no host access at install and injects no content script: the
// holder grants each origin and connects each site at run time, within these optional patterns.
const OPTIONAL_HOST_PERMISSIONS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']

// Each permission the manifest keeps must be used by the bundle, found by the API it unlocks. An
// API that also works without its permission proves nothing (chrome.tabs without "tabs"), so such
// a permission has no entry and fails until it gets an explicit rule below.
const PERMISSION_USES = {
  storage: 'chrome.storage',
  scripting: 'chrome.scripting',
  alarms: 'chrome.alarms',
  notifications: 'chrome.notifications',
  offscreen: 'chrome.offscreen',
}

// activeTab unlocks no API. Opening the popup lets it read the active tab's URL, which "Connect
// this site" needs (src/popup/components/SiteConnection.tsx), so it is kept while the popup reads it.
const EXPLICIT_RULES = {
  activeTab: { file: 'popup/index.js', use: 'chrome.tabs.query', reason: 'the popup reads the active tab' },
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
const atInstall = manifest.host_permissions ?? []
if (atInstall.length > 0) failures.push(`host_permissions grants access at install: ${atInstall.join(', ')}`)

const optional = manifest.optional_host_permissions ?? []
const missing = OPTIONAL_HOST_PERMISSIONS.filter((pattern) => !optional.includes(pattern))
const extra = optional.filter((pattern) => !OPTIONAL_HOST_PERMISSIONS.includes(pattern))
if (missing.length > 0) failures.push(`optional_host_permissions lacks ${missing.join(', ')}`)
if (extra.length > 0) {
  failures.push(
    `optional_host_permissions allows more than ${OPTIONAL_HOST_PERMISSIONS.join(', ')}: ${extra.join(', ')}`,
  )
}

// An optional API permission is asked for at run time, past the usage check on "permissions" below.
const optionalApis = manifest.optional_permissions ?? []
if (optionalApis.length > 0) failures.push(`optional_permissions lets the wallet ask for ${optionalApis.join(', ')}`)

if ((manifest.content_scripts ?? []).length > 0) {
  failures.push('content_scripts injects the bridge without the holder connecting a site')
}

for (const permission of manifest.permissions ?? []) {
  const rule = EXPLICIT_RULES[permission]
  if (rule) {
    const file = join(dist, rule.file)
    if (!existsSync(file) || !readFileSync(file, 'utf8').includes(rule.use)) {
      failures.push(
        `permissions: "${permission}" is kept because ${rule.reason}, but dist/${rule.file} has no ${rule.use}`,
      )
    }
    continue
  }
  const use = PERMISSION_USES[permission]
  if (!use) failures.push(`permissions: no usage check for "${permission}"; add one to scripts/check-manifest.mjs`)
  else if (!bundle.includes(use)) failures.push(`permissions: "${permission}" is unused (no ${use} in dist/)`)
}

if (failures.length > 0) {
  console.error('Manifest check failed. dist/manifest.json is not a production manifest:')
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(
  `Manifest check passed (permissions: ${(manifest.permissions ?? []).join(', ')}; optional hosts: ${optional.join(', ')}).`,
)
