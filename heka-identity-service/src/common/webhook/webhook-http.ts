import http from 'node:http'
import https from 'node:https'

import { createWebhookLookup, WebhookLookup } from './webhook-policy'

/** Upper bound on the response body read back from a webhook endpoint. */
export const WEBHOOK_MAX_RESPONSE_BODY_BYTES = 512_000

export type WebhookHttpOptions = {
  timeout: number
  maxRedirects: number
  maxContentLength: number
  lookup: WebhookLookup
  proxy: false
  httpAgent: http.Agent
  httpsAgent: https.Agent
}

/**
 * Axios options for outbound webhook delivery.
 *
 * `maxRedirects: 0` is deliberate and not configurable: a followed redirect would be connected
 * without passing through the egress policy again. `lookup` re-validates the resolved addresses
 * immediately before the TCP connection.
 *
 * Proxies are never used, whatever `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_USE_ENV_PROXY` say: a proxy
 * resolves and connects to the destination itself, outside `lookup`. `proxy: false` turns off axios'
 * own environment proxy detection, and the dedicated agents replace Node's global agents, which
 * become proxy-aware under `NODE_USE_ENV_PROXY`. `keepAlive` matches the global agents' default.
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
    proxy: false,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
  }
}
