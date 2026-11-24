import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The workarounds in vite.config.ts match package and file names inside Credo and its
// dependencies, so an upgrade can make one stop applying without failing the build. Each check
// looks for code in dist/ that is there only when the workaround applied (`present`) or only when
// it didn't (`absent`). The `absent` strings come from builds with that workaround removed.
const checks = [
  {
    workaround: 'Presentation Exchange stubs (src/credo/*-stub.ts)',
    present: ['Presentation Exchange is not supported. This wallet accepts DCQL requests only.'],
    // @animo-id/pex, which compiles Ajv validators and JSONPath with Function().
    absent: ['EvaluationClient'],
  },
  {
    workaround: 'cbor-x no-eval build (src/credo/cbor-no-eval.js)',
    // The default cbor-x decoder builds record readers with new Function("r", …).
    absent: ['new Function("r"'],
  },
  {
    workaround: 'setimmediate shim (src/credo/setimmediate-csp.js)',
    present: ['setImmediate callback must be a function'],
    // The setimmediate polyfill posts messages with this prefix and wraps string handlers in new Function.
    absent: ['setImmediate$'],
  },
  {
    workaround: '@digitalcredentials/open-badges-context alias',
    // Only that package lists this context; Credo's own default contexts don't.
    present: ['https://purl.imsglobal.org/spec/ob/v3p0/extensions.json'],
  },
  {
    workaround: 'reflect-metadata global lookup rewrite (strip-extension-unsafe-eval)',
    absent: ['Function("return this;")', '(void 0, eval)'],
  },
]

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

let bundle
try {
  bundle = walk(dist)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
} catch {
  console.error('dist/ is missing. Run yarn build first.')
  process.exit(1)
}

const failures = []
for (const { workaround, present = [], absent = [] } of checks) {
  for (const marker of present) {
    if (!bundle.includes(marker)) failures.push(`${workaround}: expected ${JSON.stringify(marker)} in dist/`)
  }
  for (const marker of absent) {
    if (bundle.includes(marker)) failures.push(`${workaround}: found ${JSON.stringify(marker)} in dist/`)
  }
}

if (failures.length > 0) {
  console.error('Build workaround check failed. A workaround in vite.config.ts no longer applies:')
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Build workaround check passed (${checks.length} workarounds).`)
