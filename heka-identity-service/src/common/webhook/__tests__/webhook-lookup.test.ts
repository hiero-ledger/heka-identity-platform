import dns from 'node:dns/promises'
import net from 'node:net'

import { createWebhookLookup, WebhookAddress } from 'common/webhook/webhook-policy'

type LookupResult = { error: NodeJS.ErrnoException | null; address: string | WebhookAddress[]; family?: 4 | 6 }

const callLookup = async (hostname: string, options: { all?: boolean }, allowPrivateAddresses = false) =>
  new Promise<LookupResult>((resolve) => {
    createWebhookLookup({ allowPrivateAddresses })(hostname, options, (error, address, family) =>
      resolve({ error, address, family }),
    )
  })

describe('createWebhookLookup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Node >= 20 enables `autoSelectFamily`, so sockets call the lookup with `{ all: true }` and
  // iterate the result as a list. Answering with a bare address string there makes every
  // connection fail with ERR_INVALID_IP_ADDRESS.
  test('answers { all: true } with a list of { address, family } entries', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '142.251.209.206', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ] as never)

    const { error, address } = await callLookup('hooks.example.com', { all: true })

    expect(error).toBeNull()
    expect(address).toEqual([
      { address: '142.251.209.206', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ])
    expect(net.isIP((address as WebhookAddress[])[0].address)).toBe(4)
  })

  test('answers the single-address form with (address, family)', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '142.251.209.206', family: 4 }] as never)

    const { error, address, family } = await callLookup('hooks.example.com', { all: false })

    expect(error).toBeNull()
    expect(address).toBe('142.251.209.206')
    expect(family).toBe(4)
  })

  test('hands over only addresses that passed the policy', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '142.251.209.206', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never)

    const { error, address } = await callLookup('rebind.example.com', { all: true })

    expect(error).toMatchObject({ code: 'EADDRNOTAVAIL' })
    expect(address).toBe('')
  })

  test('reports a blocked hostname as an errno error instead of throwing', async () => {
    const { error } = await callLookup('metadata.google.internal', { all: true })

    expect(error).toBeInstanceOf(Error)
    expect(error?.code).toBe('EADDRNOTAVAIL')
    expect(error?.message).toContain('HOST')
  })

  test('reports an unresolvable hostname as ENOTFOUND', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }))

    const { error } = await callLookup('nonexistent.invalid', { all: true })

    expect(error?.code).toBe('ENOTFOUND')
    expect(error?.message).toContain('DNS')
  })

  test('allowPrivateAddresses lets a private target through', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '172.18.0.5', family: 4 }] as never)

    const { error, address } = await callLookup('webhook-sink', { all: true }, true)

    expect(error).toBeNull()
    expect(address).toEqual([{ address: '172.18.0.5', family: 4 }])
  })
})
