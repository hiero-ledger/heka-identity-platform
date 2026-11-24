import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import agentConfig from 'config/agent'
import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

describe('agent config: Indy-Besu endorser key', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.DID_METHODS = 'key,indybesu'
    delete process.env.INDY_BESU_ENDORSER_PRIVATE_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('normalises the key: 0x, upper case and surrounding whitespace are accepted', () => {
    process.env.INDY_BESU_ENDORSER_PRIVATE_KEY = ` 0x${INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY.toUpperCase()}\n`

    expect(agentConfig().indyBesuEndorserPrivateKey).toBe(INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY)
  })

  it.each([
    ['too short', 'c87509a1c067bbde78beb793e6fa7653'],
    ['not hex', `${INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY.slice(0, 63)}z`],
    ['not a secp256k1 scalar', '0'.repeat(64)],
  ])('refuses a key that is %s, without the value in the message', (_label, value) => {
    process.env.INDY_BESU_ENDORSER_PRIVATE_KEY = value

    expect(() => agentConfig()).toThrow(
      'INDY_BESU_ENDORSER_PRIVATE_KEY is not a valid secp256k1 private key (64 hex characters)',
    )
    expect(() => agentConfig()).not.toThrow(value)
  })

  it('does not check the key when did:indybesu is not enabled', () => {
    process.env.DID_METHODS = 'key'
    process.env.INDY_BESU_ENDORSER_PRIVATE_KEY = 'not-a-key'

    expect(() => agentConfig()).not.toThrow()
  })
})
