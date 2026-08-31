import { createRequire } from 'node:module'
import { join } from 'node:path'

import Provider from 'oidc-provider'

/**
 * Module-system guard: the project compiles to
 * CommonJS while oidc-provider v9 is pure ESM, so the compiled code relies on
 * Node's require(esm) support (Node >= 22.12). The createRequire path below
 * exercises exactly that; the static import covers the vitest/ESM path.
 */
describe('oidc-provider', () => {
  const issuer = 'http://localhost:3005'

  test('imports and instantiates via static import', () => {
    expect(typeof Provider).toBe('function')

    const provider = new Provider(issuer)

    expect(provider.issuer).toBe(issuer)
  })

  test('loads via require(esm) — the CommonJS runtime path', () => {
    // Anchored on the project root (not import.meta.url, which CJS forbids)
    // so the file typechecks as CommonJS and still runs under vitest's ESM.
    const require = createRequire(join(process.cwd(), 'package.json'))

    const required = require('oidc-provider')
    const RequiredProvider = required.default ?? required

    expect(typeof RequiredProvider).toBe('function')
    expect(new RequiredProvider(issuer).issuer).toBe(issuer)
  })
})
