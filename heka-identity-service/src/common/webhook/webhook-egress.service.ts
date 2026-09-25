import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { InjectLogger, Logger } from 'common/logger'
import WebhookConfig from 'config/webhook'

import { resolveValidatedWebhookAddresses, WebhookTargetPolicyError } from './webhook-policy'

@Injectable()
export class WebhookEgressService {
  public constructor(
    @Inject(WebhookConfig.KEY)
    private readonly config: ConfigType<typeof WebhookConfig>,
    @InjectLogger(WebhookEgressService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  /**
   * Validates a user-supplied callback URL against the egress policy.
   * Throws {@link WebhookTargetPolicyError}; callers decide how to surface it.
   */
  public async assertCallbackUrlAllowed(webhookUrl: string): Promise<void> {
    const logger = this.logger.child('assertCallbackUrlAllowed')

    let parsed: URL
    try {
      // Parse the exact string the HTTP client will send; WHATWG already strips ASCII edge whitespace.
      parsed = new URL(webhookUrl)
    } catch {
      throw new WebhookTargetPolicyError('URL', 'Invalid webhook URL')
    }

    const scheme = parsed.protocol.slice(0, -1).toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      throw new WebhookTargetPolicyError('SCHEME', 'Webhook URL must use http or https')
    }
    if (scheme === 'http' && !this.config.allowHttp) {
      throw new WebhookTargetPolicyError('SCHEME', 'HTTPS webhook required (set WEBHOOK_ALLOW_HTTP=true for local dev)')
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw new WebhookTargetPolicyError('CREDENTIALS', 'Webhook URL must not include credentials')
    }

    try {
      await resolveValidatedWebhookAddresses(parsed.hostname, {
        allowPrivateAddresses: this.config.allowPrivateAddresses,
      })
    } catch (error: unknown) {
      if (error instanceof WebhookTargetPolicyError) {
        logger.warn({ host: parsed.hostname, policyCode: error.policyCode }, '! webhook target rejected')
      }
      throw error
    }
  }
}
