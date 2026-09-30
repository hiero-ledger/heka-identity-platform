import type { LookupAddress } from 'node:dns'

import dns from 'node:dns/promises'
import { isIP } from 'node:net'

import ipaddr from 'ipaddr.js'

/**
 * How long a caller waits for a webhook hostname to resolve, including the wait for a lookup slot.
 * It bounds the caller only: `dns.lookup` cannot be cancelled, so the lookup itself keeps running.
 */
const DNS_RESOLUTION_TIMEOUT_MS = 5_000

/**
 * `dns.lookup` runs `getaddrinfo(3)` on libuv's shared threadpool (4 threads by default) and cannot be
 * cancelled. Capping concurrent webhook lookups keeps slow or malicious DNS from occupying the whole pool;
 * a slot is freed only when the underlying lookup settles, not when its caller gives up.
 */
const MAX_CONCURRENT_DNS_LOOKUPS = 2

let inFlightLookups = 0
const lookupWaiters: Array<() => void> = []

/** Hostnames that commonly resolve to internal infrastructure regardless of what DNS answers. */
const RESERVED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
])

const RESERVED_HOST_SUFFIXES = ['.local', '.internal', '.localhost']

export type WebhookPolicyCode = 'URL' | 'SCHEME' | 'CREDENTIALS' | 'HOST' | 'ADDR' | 'DNS' | 'TIMEOUT'

export class WebhookTargetPolicyError extends Error {
  public constructor(
    public readonly policyCode: WebhookPolicyCode,
    message: string,
  ) {
    super(message)
    this.name = 'WebhookTargetPolicyError'
  }
}

export type WebhookAddressPolicy = Readonly<{
  /** Development / Docker / CI escape hatch: permits loopback, private and reserved targets. */
  allowPrivateAddresses: boolean
}>

export type WebhookAddress = Readonly<{ address: string; family: 4 | 6 }>

/**
 * DNS hook shape shared by Node's `net.LookupFunction` and the axios `lookup` option.
 * Node (>= 20, `autoSelectFamily` on by default) calls it with `{ all: true }` and expects
 * the full address list; the single-address form is kept for callers that pass `all: false`.
 */
export type WebhookLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (error: NodeJS.ErrnoException | null, address: string | WebhookAddress[], family?: 4 | 6) => void,
) => void

/** Lowercases, trims, drops the DNS root dot and unwraps `[::1]`-style IPv6 literals. */
export function normalizeWebhookHostname(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** Blocks anything that is not a globally routable unicast address (loopback, RFC1918, link-local, reserved, ...). */
export function addressIsBlockedForWebhook(address: string, policy: WebhookAddressPolicy): boolean {
  if (!ipaddr.isValid(address)) return true
  if (policy.allowPrivateAddresses) return false

  try {
    // `process` unwraps IPv4-mapped IPv6 (`::ffff:127.0.0.1` -> loopback).
    return ipaddr.process(address).range() !== 'unicast'
  } catch {
    return true
  }
}

export function hostnameIsBlockedForWebhook(hostname: string, policy: WebhookAddressPolicy): boolean {
  if (policy.allowPrivateAddresses) return false

  const host = normalizeWebhookHostname(hostname)
  return RESERVED_HOSTS.has(host) || RESERVED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/**
 * Resolves a webhook hostname and rejects it unless every answer is an allowed address.
 * Returns the validated addresses so that the caller can connect to exactly what was checked.
 */
export async function resolveValidatedWebhookAddresses(
  hostname: string,
  policy: WebhookAddressPolicy,
): Promise<WebhookAddress[]> {
  const host = normalizeWebhookHostname(hostname)
  if (!host) throw new WebhookTargetPolicyError('DNS', 'Webhook hostname is missing')

  if (hostnameIsBlockedForWebhook(host, policy)) {
    throw new WebhookTargetPolicyError('HOST', 'Webhook hostname is not permitted')
  }

  const literalFamily = isIP(host)
  if (literalFamily !== 0) {
    if (addressIsBlockedForWebhook(host, policy)) {
      throw new WebhookTargetPolicyError('ADDR', 'Webhook target address is not permitted')
    }
    return [{ address: host, family: literalFamily === 6 ? 6 : 4 }]
  }

  let resolved: WebhookAddress[]
  try {
    const answers = await boundedLookup(host)
    resolved = answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }) as const)
  } catch (error: unknown) {
    if (error instanceof WebhookTargetPolicyError) throw error
    throw new WebhookTargetPolicyError('DNS', 'Webhook hostname could not be resolved')
  }

  if (resolved.length === 0) throw new WebhookTargetPolicyError('DNS', 'Webhook hostname could not be resolved')

  for (const { address } of resolved) {
    if (addressIsBlockedForWebhook(address, policy)) {
      throw new WebhookTargetPolicyError('ADDR', 'Webhook target address is not permitted')
    }
  }

  return resolved
}

/**
 * DNS hook for the outbound HTTP client: re-runs the address policy immediately before the TCP
 * connection and hands the socket only the addresses that just passed, leaving no window for
 * DNS rebinding between validation and connect.
 */
export function createWebhookLookup(policy: WebhookAddressPolicy): WebhookLookup {
  return (hostname, options, callback) => {
    void resolveValidatedWebhookAddresses(hostname, policy).then(
      (addresses) => {
        if (options.all) {
          callback(null, addresses)
          return
        }
        const [first] = addresses
        callback(null, first.address, first.family)
      },
      (error: unknown) => callback(toLookupError(error), '', undefined),
    )
  }
}

/** Hands a freed slot to the next queued lookup, or returns it to the pool when nobody is waiting. */
function releaseLookupSlot(): void {
  const next = lookupWaiters.shift()
  if (next) {
    next()
    return
  }
  inFlightLookups -= 1
}

/**
 * Resolves `host` through the system resolver once a lookup slot is free. A single deadline covers both the
 * wait for a slot and the lookup; on expiry the caller gets `TIMEOUT` while an already started lookup keeps
 * its slot until it settles.
 */
function boundedLookup(host: string): Promise<LookupAddress[]> {
  return new Promise<LookupAddress[]>((resolve, reject) => {
    let settled = false

    const start = () => {
      // Defensive: a waiter removed on timeout is never granted, but never hold a slot for a gone caller.
      if (settled) {
        releaseLookupSlot()
        return
      }

      let lookup: Promise<LookupAddress[]>
      try {
        lookup = dns.lookup(host, { all: true })
      } catch (error: unknown) {
        releaseLookupSlot()
        settled = true
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      // Tied to the OS call, not to the caller: this is what bounds threadpool usage.
      void lookup.then(
        () => releaseLookupSlot(),
        () => releaseLookupSlot(),
      )
      lookup.then(
        (answers) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(answers)
        },
        (error: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(error)
        },
      )
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const waiting = lookupWaiters.indexOf(start)
      if (waiting !== -1) lookupWaiters.splice(waiting, 1)
      reject(new WebhookTargetPolicyError('TIMEOUT', 'Webhook DNS lookup timed out'))
    }, DNS_RESOLUTION_TIMEOUT_MS)

    if (inFlightLookups < MAX_CONCURRENT_DNS_LOOKUPS) {
      inFlightLookups += 1
      start()
    } else {
      lookupWaiters.push(start)
    }
  })
}

const LOOKUP_ERROR_CODES: Partial<Record<WebhookPolicyCode, string>> = {
  TIMEOUT: 'ETIMEDOUT',
  DNS: 'ENOTFOUND',
}

function toLookupError(error: unknown): NodeJS.ErrnoException {
  if (error instanceof WebhookTargetPolicyError) {
    const lookupError: NodeJS.ErrnoException = new Error(`${error.message} (${error.policyCode})`)
    lookupError.code = LOOKUP_ERROR_CODES[error.policyCode] ?? 'EADDRNOTAVAIL'
    return lookupError
  }

  const lookupError: NodeJS.ErrnoException = new Error(
    error instanceof Error ? error.message : 'Webhook hostname could not be resolved',
  )
  lookupError.code = 'ENOTFOUND'
  return lookupError
}
