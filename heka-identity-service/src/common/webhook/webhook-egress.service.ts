import type { WebhookNotificationsRuntimeCfg } from './webhook-policy.types'

import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { InjectLogger, Logger } from 'common/logger'
import WebhookNotificationsConfig from 'config/webhook-notifications'

import { resolveValidatedWebhookAddresses, WebhookTargetPolicyError } from './webhook-validated-resolve'

@Injectable()
export class WebhookEgressService {
  public constructor(
    @Inject(WebhookNotificationsConfig.KEY)
    private readonly cfg: ConfigType<typeof WebhookNotificationsConfig>,
    @InjectLogger(WebhookEgressService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async assertCallbackUrlAllowed(webhookUrlRaw: string): Promise<void> {
    let parsed: URL
    try {
      parsed = new URL(webhookUrlRaw.trim())
    } catch {
      throw new BadRequestException('Invalid webhook URL')
    }

    const scheme = parsed.protocol.slice(0, -1).toLowerCase()
    if (!(scheme === 'http' || scheme === 'https')) {
      throw new BadRequestException('Webhook URL must use http or https')
    }
    if (scheme === 'http' && !this.cfg.allowHttp) {
      throw new BadRequestException('HTTPS webhook required (WEBHOOK_ALLOW_HTTP=true for local dev)')
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw new BadRequestException('Webhook URL must not include credentials')
    }

    const host = parsed.hostname
    if (!host) throw new BadRequestException('Webhook URL hostname missing')

    const runtimeCfg: WebhookNotificationsRuntimeCfg = {
      dnsResolutionTimeoutMs: this.cfg.dnsResolutionTimeoutMs,
      allowInternalDnsNames: this.cfg.allowInternalDnsNames,
    }

    try {
      await resolveValidatedWebhookAddresses(host, runtimeCfg)
    } catch (error: unknown) {
      const log = this.logger.child('assertCallbackUrlAllowed')

      if (error instanceof WebhookTargetPolicyError) {
        switch (error.policyCode) {
          case 'HOST':
            log.warn({ host }, '! hostname blocked')
            throw new BadRequestException('Webhook hostname is not permitted')
          case 'ADDR':
            log.warn({ host }, '! address blocked')
            throw new BadRequestException('Webhook target address is not permitted')
          case 'DNS':
            log.warn({ host }, '! dns empty')
            throw new BadRequestException('Webhook hostname could not be resolved')
          case 'TIMEOUT':
            log.warn({ host }, '! dns timeout')
            throw new BadRequestException('Webhook DNS lookup timed out')
          default:
            throw error
        }
      }

      throw error
    }
  }
}
