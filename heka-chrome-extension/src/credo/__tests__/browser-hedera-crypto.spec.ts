import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'

import { Crypto } from '../browser-hedera-crypto'

describe('browser Hedera crypto', () => {
  it('matches Node sha256 for the bytes HCS checksums hash', () => {
    const payload = new TextEncoder().encode('did:hedera topic payload')
    expect(Crypto.sha256(payload)).toBe(createHash('sha256').update(payload).digest('hex'))
  })
})
