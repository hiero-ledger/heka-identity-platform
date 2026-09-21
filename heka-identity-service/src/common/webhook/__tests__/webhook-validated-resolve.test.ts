import dns from 'node:dns'

import { resolveValidatedWebhookAddresses } from 'common/webhook/webhook-validated-resolve'

describe('resolveValidatedWebhookAddresses', () => {
  const cfg = { dnsResolutionTimeoutMs: 5000, allowInternalDnsNames: false }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('blocked literal IPv4 throws ADDR', async () => {
    await expect(resolveValidatedWebhookAddresses('127.0.0.1', cfg)).rejects.toMatchObject({
      policyCode: 'ADDR',
    })
  })

  test('disallowed hostname suffix throws HOST without allow flag', async () => {
    await expect(resolveValidatedWebhookAddresses('x.internal', cfg)).rejects.toMatchObject({
      policyCode: 'HOST',
    })
  })

  test('empty DNS yields DNS', async () => {
    vi.spyOn(dns.promises, 'resolve4').mockRejectedValue(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }))
    vi.spyOn(dns.promises, 'resolve6').mockRejectedValue(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }))
    await expect(resolveValidatedWebhookAddresses('nonexistent.fake-heka-dns.invalid', cfg)).rejects.toMatchObject({
      policyCode: 'DNS',
    })
  })

  test('returns sorted addresses', async () => {
    vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['142.251.209.206', '8.8.8.8'])
    vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([])
    const out = await resolveValidatedWebhookAddresses('stub.example.invalid', cfg)
    expect(out).toEqual(['142.251.209.206', '8.8.8.8'].sort())
  })
})
