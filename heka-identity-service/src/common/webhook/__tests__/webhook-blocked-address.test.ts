import { addressIsBlockedForWebhook, hostnameIsExplicitlyBlocked } from 'common/webhook/webhook-blocked-address'

describe('addressIsBlockedForWebhook', () => {
  describe('IPv4', () => {
    test.each([
      ['142.251.209.206', false],
      ['1.1.1.1', false],
      ['203.0.113.88', true],
      ['127.0.0.1', true],
      ['192.168.1.9', true],
      ['10.33.44.55', true],
      ['172.31.254.254', true],
      ['169.254.169.254', true],
      ['0.0.0.0', true],
    ])('%s blocked=%s', (ip: string, blocked: boolean) => {
      expect(addressIsBlockedForWebhook(ip)).toBe(blocked)
    })
  })

  describe('IPv6', () => {
    test.each([
      ['::1', true],
      ['fe80::dead:beef:cafe:babe', true],
      ['fc01::42', true],
      ['fd01::1234', true],
      ['2001:db8::1', true],
      ['2001:4860:4860::8888', false],
      ['::ffff:127.0.0.1', true],
    ])('%s blocked=%s', (ip: string, blocked: boolean) => {
      expect(addressIsBlockedForWebhook(ip)).toBe(blocked)
    })
  })
})

describe('hostnameIsExplicitlyBlocked', () => {
  test('default rules', () => {
    expect(hostnameIsExplicitlyBlocked('LOCALHOST', false)).toBe(true)
    expect(hostnameIsExplicitlyBlocked('evil.internal', false)).toBe(true)
    expect(hostnameIsExplicitlyBlocked('x.local', false)).toBe(true)
    expect(hostnameIsExplicitlyBlocked('svc.my.localhost', false)).toBe(true)
    expect(hostnameIsExplicitlyBlocked('hooks.site', false)).toBe(false)
  })

  test('WEBHOOK_ALLOW_INTERNAL_DNS_NAMES style passthrough', () => {
    expect(hostnameIsExplicitlyBlocked('corp.internal', true)).toBe(false)
    expect(hostnameIsExplicitlyBlocked('svc.cluster.local', true)).toBe(false)
    expect(hostnameIsExplicitlyBlocked('localhost', true)).toBe(true)
  })
})
