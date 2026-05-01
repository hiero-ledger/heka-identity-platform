import type { WebhookNotificationsRuntimeCfg } from './webhook-policy.types'

import { isIP, type LookupFunction } from 'node:net'

import { resolveValidatedWebhookAddresses, WebhookTargetPolicyError } from './webhook-validated-resolve'

/** Validates again at TCP connect (`Agent.lookup`) using the same policy as PATCH. */
export function createWebhookConnectionLookup(cfg: WebhookNotificationsRuntimeCfg): LookupFunction {
  const lookupFn: LookupFunction = (hostname, _options, callback) => {
    void Promise.resolve()
      .then(async () => resolveValidatedWebhookAddresses(hostname, cfg))
      .then((addrs) => {
        const pick = addrs[0]
        if (!pick) {
          const err = new Error('ENOTDATA') as NodeJS.ErrnoException
          err.code = 'ENOTFOUND'
          callback(err, '', undefined)
          return
        }
        const family = isIP(pick)
        if (family === 0) {
          const err = new Error('EBADADDR') as NodeJS.ErrnoException
          err.code = 'EINVAL'
          callback(err, '', undefined)
          return
        }
        callback(null, pick, family === 6 ? 6 : 4)
      })
      .catch((e: unknown) => {
        if (e instanceof WebhookTargetPolicyError) {
          const err = new Error(`webhook (${e.policyCode})`) as NodeJS.ErrnoException
          err.code = e.policyCode === 'TIMEOUT' ? 'ETIMEDOUT' : 'EADDRNOTAVAIL'
          callback(err, '', undefined)
          return
        }
        const err = new Error(String(e ?? 'ENOTFOUND')) as NodeJS.ErrnoException
        err.code = 'ENOTFOUND'
        callback(err, '', undefined)
      })
  }

  return lookupFn
}
