import { ConfigService, OidcConfig } from '../../src/core/config'
import {
  IdentityAcquirer,
  StubIdentityAcquirer,
  supportsDcApiLogin,
  supportsDirectPostLogin,
  VerificationSessionClient,
  WalletIdentityAcquirer,
} from '../../src/oidc'

describe('identity acquirer capabilities', () => {
  test('the stub implements the core flow only — it never renders a page', () => {
    const stub = new StubIdentityAcquirer()
    expect(supportsDirectPostLogin(stub)).toBe(false)
    expect(supportsDcApiLogin(stub)).toBe(false)
  })

  test('the wallet acquirer serves both login paths', () => {
    const configService = { oidcConfig: new OidcConfig({}) } as unknown as ConfigService
    const wallet = new WalletIdentityAcquirer({} as VerificationSessionClient, configService)
    expect(supportsDirectPostLogin(wallet)).toBe(true)
    expect(supportsDcApiLogin(wallet)).toBe(true)
  })

  test('no acquirer bound → no capability', () => {
    expect(supportsDirectPostLogin(null)).toBe(false)
    expect(supportsDcApiLogin(null)).toBe(false)
  })

  test('a capability is all-or-nothing — a partial implementation does not count', () => {
    const core = { beginLogin: vi.fn(), completeLogin: vi.fn() }
    const startOnly = { ...core, beginDcApiLogin: vi.fn() } as unknown as IdentityAcquirer
    const pollOnly = { ...core, checkLogin: vi.fn() } as unknown as IdentityAcquirer
    expect(supportsDcApiLogin(startOnly)).toBe(false)
    expect(supportsDirectPostLogin(pollOnly)).toBe(false)
  })
})
