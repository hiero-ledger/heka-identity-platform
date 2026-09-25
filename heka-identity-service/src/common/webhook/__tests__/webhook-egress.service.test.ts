import dns from 'node:dns/promises'

import { createMock } from '@golevelup/ts-vitest'
import { ConfigType } from '@nestjs/config'

import { Logger } from 'common/logger'
import { WebhookEgressService } from 'common/webhook/webhook-egress.service'
import WebhookConfig from 'config/webhook'

describe('WebhookEgressService', () => {
  const build = (overrides: Partial<ConfigType<typeof WebhookConfig>> = {}) =>
    new WebhookEgressService(
      { allowHttp: false, allowPrivateAddresses: false, timeoutMs: 10_000, ...overrides },
      createMock<Logger>({ child: () => createMock<Logger>() }),
    )

  beforeEach(() => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '142.251.209.206', family: 4 }] as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('accepts an https URL that resolves to a public address', async () => {
    await expect(build().assertCallbackUrlAllowed('https://hooks.example.com/notify')).resolves.toBeUndefined()
  })

  test('rejects a malformed URL', async () => {
    await expect(build().assertCallbackUrlAllowed('not a url')).rejects.toMatchObject({ policyCode: 'URL' })
  })

  // The stored string is sent as-is, so it must be validated as-is: String#trim strips Unicode
  // whitespace that the HTTP client's URL parser rejects.
  test.each([
    '\u00a0https://hooks.example.com/notify',
    '\ufeffhttps://hooks.example.com/notify',
    'https://hooks.example.com\u00a0',
  ])('rejects a URL the HTTP client cannot parse (%j)', async (url: string) => {
    await expect(build().assertCallbackUrlAllowed(url)).rejects.toMatchObject({ policyCode: 'URL' })
  })

  test('accepts a URL padded with ASCII whitespace', async () => {
    await expect(build().assertCallbackUrlAllowed('  https://hooks.example.com/notify  ')).resolves.toBeUndefined()
  })

  test.each(['ftp://hooks.example.com', 'file:///etc/passwd', 'gopher://hooks.example.com'])(
    'rejects the %s scheme',
    async (url: string) => {
      await expect(build().assertCallbackUrlAllowed(url)).rejects.toMatchObject({ policyCode: 'SCHEME' })
    },
  )

  test('rejects http by default and accepts it behind WEBHOOK_ALLOW_HTTP', async () => {
    await expect(build().assertCallbackUrlAllowed('http://hooks.example.com')).rejects.toMatchObject({
      policyCode: 'SCHEME',
    })
    await expect(
      build({ allowHttp: true }).assertCallbackUrlAllowed('http://hooks.example.com'),
    ).resolves.toBeUndefined()
  })

  test('rejects embedded credentials', async () => {
    await expect(build().assertCallbackUrlAllowed('https://user:secret@hooks.example.com')).rejects.toMatchObject({
      policyCode: 'CREDENTIALS',
    })
  })

  test.each([
    ['https://127.0.0.1/hook', 'ADDR'],
    ['https://[::1]/hook', 'ADDR'],
    // WHATWG URL normalizes these numeric forms to 127.0.0.1 before the policy runs
    ['https://2130706433/hook', 'ADDR'],
    ['https://0x7f.1/hook', 'ADDR'],
    ['https://localhost/hook', 'HOST'],
    ['https://metadata.google.internal./hook', 'HOST'],
    ['https://sink.svc.cluster.local/hook', 'HOST'],
  ])('rejects %s with %s', async (url: string, policyCode: string) => {
    await expect(build().assertCallbackUrlAllowed(url)).rejects.toMatchObject({ policyCode })
  })

  test('WEBHOOK_ALLOW_PRIVATE_ADDRESSES permits internal targets without relaxing the scheme rule', async () => {
    const service = build({ allowPrivateAddresses: true })

    await expect(service.assertCallbackUrlAllowed('https://127.0.0.1:9999/hook')).resolves.toBeUndefined()
    await expect(service.assertCallbackUrlAllowed('https://localhost:9999/hook')).resolves.toBeUndefined()
    await expect(service.assertCallbackUrlAllowed('http://localhost:9999/hook')).rejects.toMatchObject({
      policyCode: 'SCHEME',
    })
    await expect(service.assertCallbackUrlAllowed('https://user:pw@localhost:9999/hook')).rejects.toMatchObject({
      policyCode: 'CREDENTIALS',
    })
  })

  test('rejects a hostname that resolves to a blocked address', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)

    await expect(build().assertCallbackUrlAllowed('https://rebind.example.com/hook')).rejects.toMatchObject({
      policyCode: 'ADDR',
    })
  })
})
