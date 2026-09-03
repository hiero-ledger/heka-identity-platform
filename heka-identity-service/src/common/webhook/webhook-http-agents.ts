import type { WebhookNotificationsRuntimeCfg } from './webhook-policy.types'

import http from 'node:http'
import https from 'node:https'

import { createWebhookConnectionLookup } from './webhook-connection-lookup'

/** Short-lived outbound agents — same DNS policy enforced at PATCH time and immediately before TCP connect */
export function createWebhookHttpAgents(cfg: WebhookNotificationsRuntimeCfg): {
  httpAgent: http.Agent
  httpsAgent: https.Agent
} {
  const lookup = createWebhookConnectionLookup(cfg)
  return {
    httpAgent: new http.Agent({ keepAlive: false, lookup }),
    httpsAgent: new https.Agent({ keepAlive: false, lookup }),
  }
}
