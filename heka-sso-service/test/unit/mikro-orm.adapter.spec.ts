import { EntityManager } from '@mikro-orm/core'

import { MikroOrmAdapter } from '../../src/oidc'

type Row = Record<string, any>

const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value)

/**
 * In-memory stand-in for the forked EntityManager: implements exactly the four
 * operations the adapter uses (`upsert`, `findOne`, `nativeUpdate`,
 * `nativeDelete`) over a plain row array with the table's composite-PK
 * semantics (`name`, `id`). `fork()` is counted — the adapter must fork per
 * operation (INTEGRATION.md §5: no ambient RequestContext).
 */
class FakeEntityManager {
  public rows: Row[] = []
  public forkCount = 0

  public fork(): this {
    this.forkCount++
    return this
  }

  public async upsert(_entity: unknown, data: Row): Promise<void> {
    const existing = this.rows.find((row) => row.name === data.name && row.id === data.id)
    if (existing) Object.assign(existing, data)
    else this.rows.push({ ...data })
  }

  public async findOne(_entity: unknown, where: Row): Promise<Row | null> {
    return this.rows.find((row) => matches(row, where)) ?? null
  }

  public async nativeUpdate(_entity: unknown, where: Row, data: Row): Promise<number> {
    const hits = this.rows.filter((row) => matches(row, where))
    for (const row of hits) Object.assign(row, data)
    return hits.length
  }

  public async nativeDelete(_entity: unknown, where: Row): Promise<number> {
    const before = this.rows.length
    this.rows = this.rows.filter((row) => !matches(row, where))
    return before - this.rows.length
  }
}

const buildAdapter = (name = 'AccessToken') => {
  const em = new FakeEntityManager()
  return { em, adapter: new MikroOrmAdapter(name, em as unknown as EntityManager) }
}

/** MikroORM adapter contract (P1.5/P1.8): the 8-method contract over `oidc_entity`. */
describe('MikroOrmAdapter', () => {
  test('upsert + find round-trip; secondary-lookup columns copied out of the payload', async () => {
    const { em, adapter } = buildAdapter()

    await adapter.upsert('token-1', { jti: 'token-1', grantId: 'grant-1', uid: 'uid-1', userCode: 'ABC-123' }, 60)

    const row = em.rows[0]
    expect(row).toMatchObject({ name: 'AccessToken', id: 'token-1', grantId: 'grant-1', uid: 'uid-1', userCode: 'ABC-123' })
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now())

    expect(await adapter.find('token-1')).toMatchObject({ jti: 'token-1', grantId: 'grant-1' })
    expect(await adapter.find('unknown')).toBeUndefined()
  })

  test('upsert replaces the payload of an existing (name, id) row', async () => {
    const { adapter } = buildAdapter()

    await adapter.upsert('token-1', { jti: 'token-1', scope: 'openid' }, 60)
    await adapter.upsert('token-1', { jti: 'token-1', scope: 'openid profile' }, 60)

    expect(await adapter.find('token-1')).toMatchObject({ scope: 'openid profile' })
  })

  test('no expiry (expiresIn omitted) stores a non-expiring row', async () => {
    const { em, adapter } = buildAdapter('Client')

    await adapter.upsert('client-1', { client_id: 'client-1' })

    expect(em.rows[0].expiresAt).toBeNull()
    expect(await adapter.find('client-1')).toMatchObject({ client_id: 'client-1' })
  })

  test('rows are scoped by model name — same id under another name does not collide', async () => {
    const em = new FakeEntityManager()
    const accessTokens = new MikroOrmAdapter('AccessToken', em as unknown as EntityManager)
    const refreshTokens = new MikroOrmAdapter('RefreshToken', em as unknown as EntityManager)

    await accessTokens.upsert('same-id', { kind: 'access' }, 60)
    await refreshTokens.upsert('same-id', { kind: 'refresh' }, 60)

    expect(em.rows).toHaveLength(2)
    expect(await accessTokens.find('same-id')).toMatchObject({ kind: 'access' })
    expect(await refreshTokens.find('same-id')).toMatchObject({ kind: 'refresh' })
  })

  test('expired rows are treated as absent on every read path', async () => {
    const { em, adapter } = buildAdapter('Session')

    await adapter.upsert('session-1', { uid: 'uid-1', userCode: 'CODE-1' }, 60)
    em.rows[0].expiresAt = new Date(Date.now() - 1000)

    expect(await adapter.find('session-1')).toBeUndefined()
    expect(await adapter.findByUid('uid-1')).toBeUndefined()
    expect(await adapter.findByUserCode('CODE-1')).toBeUndefined()
  })

  test('findByUid / findByUserCode resolve via the secondary columns', async () => {
    const { adapter } = buildAdapter('Session')

    await adapter.upsert('session-1', { jti: 'session-1', uid: 'uid-1', userCode: 'CODE-1' }, 60)

    expect(await adapter.findByUid('uid-1')).toMatchObject({ jti: 'session-1' })
    expect(await adapter.findByUserCode('CODE-1')).toMatchObject({ jti: 'session-1' })
    expect(await adapter.findByUid('other')).toBeUndefined()
  })

  test('consume marks the row — the payload then carries the consumed epoch (code replay rejection)', async () => {
    const { adapter } = buildAdapter('AuthorizationCode')

    await adapter.upsert('code-1', { jti: 'code-1' }, 60)
    expect(await adapter.find('code-1')).not.toHaveProperty('consumed')

    await adapter.consume('code-1')

    const consumed = await adapter.find('code-1')
    expect(consumed?.consumed).toBeTypeOf('number')
    expect(consumed!.consumed! * 1000).toBeLessThanOrEqual(Date.now())
  })

  test('destroy removes only the (name, id) row', async () => {
    const em = new FakeEntityManager()
    const accessTokens = new MikroOrmAdapter('AccessToken', em as unknown as EntityManager)
    const refreshTokens = new MikroOrmAdapter('RefreshToken', em as unknown as EntityManager)

    await accessTokens.upsert('artifact-1', { kind: 'access' }, 60)
    await refreshTokens.upsert('artifact-1', { kind: 'refresh' }, 60)

    await accessTokens.destroy('artifact-1')

    expect(await accessTokens.find('artifact-1')).toBeUndefined()
    expect(await refreshTokens.find('artifact-1')).toMatchObject({ kind: 'refresh' })
  })

  test('revokeByGrantId removes every artifact of the grant across all model names', async () => {
    const em = new FakeEntityManager()
    const accessTokens = new MikroOrmAdapter('AccessToken', em as unknown as EntityManager)
    const refreshTokens = new MikroOrmAdapter('RefreshToken', em as unknown as EntityManager)

    await accessTokens.upsert('access-1', { grantId: 'grant-1' }, 60)
    await refreshTokens.upsert('refresh-1', { grantId: 'grant-1' }, 60)
    await accessTokens.upsert('access-2', { grantId: 'grant-2' }, 60)

    await accessTokens.revokeByGrantId('grant-1')

    expect(await accessTokens.find('access-1')).toBeUndefined()
    expect(await refreshTokens.find('refresh-1')).toBeUndefined()
    expect(await accessTokens.find('access-2')).toMatchObject({ grantId: 'grant-2' })
  })

  test('forks the EntityManager for every operation — no ambient request context (§5)', async () => {
    const { em, adapter } = buildAdapter()

    await adapter.upsert('token-1', { jti: 'token-1' }, 60)
    await adapter.find('token-1')
    await adapter.findByUid('none')
    await adapter.findByUserCode('none')
    await adapter.consume('token-1')
    await adapter.destroy('token-1')
    await adapter.revokeByGrantId('grant-1')

    expect(em.forkCount).toBe(7)
  })
})
