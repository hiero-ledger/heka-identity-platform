import { OidcEntity } from '@core/database'
import { EntityManager } from '@mikro-orm/core'
import type { Adapter, AdapterPayload } from 'oidc-provider'

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

  public async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(await this.em.fork().findOne(OidcEntity, { name: this.name, userCode }))
  }

  public async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.toPayload(await this.em.fork().findOne(OidcEntity, { name: this.name, uid }))
  }

  public async consume(id: string): Promise<void> {
    const affected = await this.em.fork().nativeUpdate(OidcEntity, { name: this.name, id, consumedAt: null }, { consumedAt: new Date() })
    if (affected === 0) throw new Error(`${this.name} '${id}' is already consumed or gone`)
  }

  public async destroy(id: string): Promise<void> {
    await this.em.fork().nativeDelete(OidcEntity, { name: this.name, id })
  }

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
