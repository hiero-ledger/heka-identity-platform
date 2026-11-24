import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

function walk(directory) {
  const files = []
  let entries
  try {
    entries = readdirSync(directory)
  } catch {
    console.error('dist/ is missing. Run yarn build first.')
    process.exit(1)
  }
  for (const name of entries) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else if (name.endsWith('.js')) files.push(path)
  }
  return files
}

const offenders = []
for (const file of walk(dist)) {
  const source = readFileSync(file, 'utf8')
  if (source.includes('new Function') || source.includes('eval(')) offenders.push(file)
}

if (offenders.length > 0) {
  console.error('CSP check failed. These files contain new Function or eval(:')
  for (const file of offenders) console.error(file)
  process.exit(1)
}

console.log('CSP check passed.')
