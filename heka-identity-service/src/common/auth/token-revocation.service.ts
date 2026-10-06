import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { isAxiosError } from 'axios'

import { InjectLogger, Logger } from 'common/logger'
import TokenRevocationConfig from 'config/token-revocation'

/**
 * Asks Heka Auth Service whether an access token is still active (not revoked by logout or refresh).
 *
 * No-op unless `JWT_REVOCATION_CHECK_ENABLED=true`. When enabled the check fails closed: any answer other than
 * an explicit "active" (inactive, 401/403, 429, 5xx, timeout, network error, malformed response) rejects the token.
 * The token itself is never logged.
 */
@Injectable()
export class TokenRevocationService {
  public constructor(
    private readonly httpService: HttpService,
    @Inject(TokenRevocationConfig.KEY)
    private readonly config: ConfigType<typeof TokenRevocationConfig>,
    @InjectLogger(TokenRevocationService)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public async assertTokenActive(token: string): Promise<void> {
    if (!this.config.enabled) return

    const logger = this.logger.child('assertTokenActive')
    logger.trace('>')

    const { url, timeoutMs } = this.config
    if (!url) {
      // Unreachable: the config factory refuses to start without a URL when the check is enabled.
      logger.error('Token revocation check is enabled but no URL is configured')
      throw new UnauthorizedException()
    }

    let status: number
    let data: unknown
    try {
      const response = await this.httpService.axiosRef.post(url, undefined, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: timeoutMs,
        // `timeout` is idle-based; the signal adds a wall-clock deadline for the whole request.
        signal: AbortSignal.timeout(timeoutMs),
        maxRedirects: 0,
        // Every HTTP status is classified below instead of being thrown.
        validateStatus: () => true,
      })
      status = response.status
      data = response.data
    } catch (error) {
      logger.warn({ error: errorForLog(error) }, 'Token revocation check failed: Auth Service is unreachable')
      throw new UnauthorizedException()
    }

    if (status === 200 && isIntrospectionResult(data)) {
      if (data.active) {
        logger.trace('< active')
        return
      }
      logger.debug('Token rejected: Auth Service reports it as inactive (revoked, expired or unknown)')
      throw new UnauthorizedException()
    }

    if (status === 401 || status === 403) {
      logger.debug({ status }, 'Token rejected by Auth Service')
      throw new UnauthorizedException()
    }

    logger.warn({ status }, 'Token revocation check failed: unexpected response from Auth Service')
    throw new UnauthorizedException()
  }
}

function isIntrospectionResult(data: unknown): data is { active: boolean } {
  return typeof data === 'object' && data !== null && typeof (data as { active?: unknown }).active === 'boolean'
}

// Axios errors serialize their request config, including the Authorization header, so log only diagnostic fields.
function errorForLog(error: unknown): Record<string, unknown> {
  if (isAxiosError(error)) {
    return { name: error.name, code: error.code, status: error.response?.status }
  }
  if (error instanceof Error) {
    return { name: error.name, code: (error as NodeJS.ErrnoException).code }
  }
  return { type: typeof error }
}
