import { OidcEntity } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import type { Adapter, AdapterPayload } from 'oidc-provider'

/**
 * MikroORM adapter for `oidc-provider`: the 8-method
 * contract from `example/my_adapter.js` over the `oidc_entity` table — one
 * adapter instance per model name, one row per model instance.
 *
 * The provider invokes these methods from its own Koa middleware, outside
 * Nest's request lifecycle — no ambient `RequestContext` is active, so every
 * operation forks the injected EntityManager.
 *
 * Expired rows are treated as absent on read; `OidcCleanupService` purges
 * them hourly.
 */
export class MikroOrmAdapter implements Adapter {
  public constructor(
    private readonly name: string,
    private readonly em: EntityManager
  ) {}

  public async upsert(id: string, payload: AdapterPayload, expiresIn?: number): Promise<void> {
    await this.em.fork().upsert(OidcEntity, {
      name: this.name,
      id,
      payload: payload as Record<string, unknown>,
      grantId: payload.grantId ?? null,
      userCode: payload.userCode ?? null,
      uid: payload.uid ?? null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      updatedAt: new Date(),
      consumedAt: null,
    })
  }

  public async find(id: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(await this.em.fork().findOne(OidcEntity, { name: this.name, id }))
  }

  /** Secondary lookup for DeviceCode (device flow user codes). */
  public async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(await this.em.fork().findOne(OidcEntity, { name: this.name, userCode }))
  }

  /** Secondary lookup for Session (`uid` claim in id_tokens / session management). */
  public async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(await this.em.fork().findOne(OidcEntity, { name: this.name, uid }))
  }

  /**
   * Marks single-use artifacts (authorization codes, rotated refresh tokens)
   * as used — reuse is then rejected by the provider. The update is
   * conditional on the row being unconsumed: of two concurrent consumers only
   * one matches, and the loser's throw fails its token request instead of
   * issuing a second token — the provider's own find-then-check cannot see
   * that window (docs/toctou-remediation-plan.md, issue 3).
   */
  public async consume(id: string): Promise<void> {
    const affected = await this.em.fork().nativeUpdate(OidcEntity, { name: this.name, id, consumedAt: null }, { consumedAt: new Date() })
    if (affected === 0) throw new Error(`${this.name} '${id}' is already consumed or gone`)
  }

  public async destroy(id: string): Promise<void> {
    await this.em.fork().nativeDelete(OidcEntity, { name: this.name, id })
  }

  /** Revokes every artifact of a grant — across all model names, per the adapter contract. */
  public async revokeByGrantId(grantId: string): Promise<void> {
    await this.em.fork().nativeDelete(OidcEntity, { grantId })
  }

  private toPayload(row: OidcEntity | null): AdapterPayload | undefined {
    if (!row) return undefined
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined
    return {
      ...(row.payload as AdapterPayload),
      ...(row.consumedAt && { consumed: Math.floor(row.consumedAt.getTime() / 1000) }),
    }
  }
}
