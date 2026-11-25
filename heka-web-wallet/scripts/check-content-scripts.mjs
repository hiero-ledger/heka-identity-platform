import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

// Chrome runs content scripts as classic scripts. A file with an `import` or `export` statement
// fails to parse there, and nothing in it runs. Compiling each file as a classic script (without
// running it) fails the same way.
const directory = fileURLToPath(new URL('../dist/content-scripts/', import.meta.url))

let files
try {
  files = readdirSync(directory).filter((name) => name.endsWith('.js'))
} catch {
  console.error('dist/content-scripts/ is missing. Run yarn build first.')
  process.exit(1)
}

const failures = []
for (const name of files) {
  try {
    new Script(readFileSync(join(directory, name), 'utf8'), { filename: name })
  } catch (error) {
    failures.push(`content-scripts/${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (files.length === 0 || failures.length > 0) {
  console.error('Content script check failed. Each content script must parse as a classic script.')
  if (files.length === 0) console.error('dist/content-scripts/ has no .js file.')
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Content script check passed: ${files.map((name) => `content-scripts/${name}`).join(', ')}.`)
