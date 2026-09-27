import { createRequire } from 'node:module'
import { join } from 'node:path'

import Provider from 'oidc-provider'

describe('oidc-provider', () => {
  const issuer = 'http://localhost:3005'

  test('imports and instantiates via static import', () => {
    expect(typeof Provider).toBe('function')

    const provider = new Provider(issuer)

    expect(provider.issuer).toBe(issuer)
  })

  test('loads via require(esm) — the CommonJS runtime path', () => {
    const require = createRequire(join(process.cwd(), 'package.json'))

    const required = require('oidc-provider')
    const RequiredProvider = required.default ?? required

    expect(typeof RequiredProvider).toBe('function')
    expect(new RequiredProvider(issuer).issuer).toBe(issuer)
  })
})
