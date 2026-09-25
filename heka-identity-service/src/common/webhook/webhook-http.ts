import { createWebhookLookup, WebhookLookup } from './webhook-policy'

/** Upper bound on the response body read back from a webhook endpoint. */
export const WEBHOOK_MAX_RESPONSE_BODY_BYTES = 512_000

export type WebhookHttpOptions = {
  timeout: number
  maxRedirects: number
  maxContentLength: number
  lookup: WebhookLookup
}

/**
 * Axios options for outbound webhook delivery.
 *
 * `maxRedirects: 0` is deliberate and not configurable: a followed redirect would be connected
 * without passing through the egress policy again. `lookup` re-validates the resolved addresses
 * immediately before the TCP connection.
 */
export function createWebhookHttpOptions(config: {
  timeoutMs: number
  allowPrivateAddresses: boolean
}): WebhookHttpOptions {
  return {
    timeout: config.timeoutMs,
    maxRedirects: 0,
    maxContentLength: WEBHOOK_MAX_RESPONSE_BODY_BYTES,
    lookup: createWebhookLookup({ allowPrivateAddresses: config.allowPrivateAddresses }),
  }
}
