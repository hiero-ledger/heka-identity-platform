import { ConfigService } from '@config'
import { Injectable, Logger } from '@nestjs/common'

import { ClaimSet } from './claims.util'

/**
 * Verified-claims store: the interaction stores mapped claim set keyed by the computed `sub` when login completes;
 */
@Injectable()
export class AccountClaimsStore {
  private readonly logger = new Logger(AccountClaimsStore.name)
  private readonly entries = new Map<string, { claims: ClaimSet; expiresAt: number }>()
  private readonly ttlMs: number

  public constructor(configService: ConfigService) {
    this.ttlMs = configService.oidcConfig.ttl.session * 1000
  }

  public set(sub: string, claims: ClaimSet): void {
    this.prune()
    this.entries.set(sub, { claims, expiresAt: Date.now() + this.ttlMs })
    this.logger.verbose(`Stored claim set for sub ${sub}`)
  }

  public get(sub: string): ClaimSet | undefined {
    const entry = this.entries.get(sub)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(sub)
      return undefined
    }
    return entry.claims
  }

  private prune(): void {
    const now = Date.now()
    for (const [sub, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(sub)
    }
  }
}
