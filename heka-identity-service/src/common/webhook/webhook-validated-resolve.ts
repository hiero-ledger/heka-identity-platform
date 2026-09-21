import type { WebhookNotificationsRuntimeCfg } from './webhook-policy.types'

import { isIP } from 'node:net'

import { addressIsBlockedForWebhook, hostnameIsExplicitlyBlocked } from './webhook-blocked-address'
import { resolveAllAddresses, withTimeout } from './webhook-dns'

export class WebhookTargetPolicyError extends Error {
  public constructor(public readonly policyCode: 'HOST' | 'ADDR' | 'DNS' | 'TIMEOUT') {
    super(policyCode)
  }
}

/** Resolves a hostname webhook target and rejects anything that resolves to blocked addresses */
export async function resolveValidatedWebhookAddresses(
  hostname: string,
  cfg: WebhookNotificationsRuntimeCfg,
): Promise<string[]> {
  const host = hostname.trim()
  if (!host) throw new WebhookTargetPolicyError('DNS')

  if (hostnameIsExplicitlyBlocked(host, cfg.allowInternalDnsNames)) throw new WebhookTargetPolicyError('HOST')

  const dnsKind = isIP(host)
  if (dnsKind === 4 || dnsKind === 6) {
    if (addressIsBlockedForWebhook(host)) throw new WebhookTargetPolicyError('ADDR')
    return [host]
  }

  let addresses: string[]
  try {
    addresses = await withTimeout(resolveAllAddresses(host), cfg.dnsResolutionTimeoutMs, 'DNS_TIMEOUT')
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'DNS_TIMEOUT') throw new WebhookTargetPolicyError('TIMEOUT')
    throw new WebhookTargetPolicyError('DNS')
  }

  if (!addresses.length) throw new WebhookTargetPolicyError('DNS')

  const sorted = [...addresses].sort()
  for (const addr of sorted) {
    if (addressIsBlockedForWebhook(addr)) throw new WebhookTargetPolicyError('ADDR')
  }

  return sorted
}
