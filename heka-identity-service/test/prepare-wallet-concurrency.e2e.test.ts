import { Server } from 'net'

import { createMock } from '@golevelup/ts-vitest'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication, ServiceUnavailableException } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { Schema } from 'src/common/entities'
import { Logger } from 'src/common/logger'
import { WalletLockService } from 'src/common/wallet-lock'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'
import TestMikroOrmConfig from 'test/config/mikro-orm'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

/** Phase 8 of docs/role-model-and-oidc-providers.md: concurrent `POST /prepare-wallet` for one wallet. */
describe('E2E concurrent prepare-wallet', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  const mockLogger = () => {
    const logger: Logger = createMock<Logger>()
    vi.mocked(logger.child).mockReturnValue(logger)
    return logger
  }

  describe('the wallet lock holds across instances', () => {
    // Two services with their own connections, as two Identity Service instances would have
    const instances = () => [1, 2].map(() => new WalletLockService(TestMikroOrmConfig() as never, mockLogger()))

    const timed = async (lock: WalletLockService, walletId: string, timeout = 30, hold = 300) => {
      let start = 0
      let end = 0
      await lock.runExclusive(walletId, timeout, async () => {
        start = Date.now()
        await sleep(hold)
        end = Date.now()
      })
      return { start, end }
    }

    test('two instances never hold the lock of one wallet at the same time', async () => {
      const [a, b] = instances()
      const walletId = `Organization_${uuid()}`

      const [first, second] = await Promise.all([timed(a, walletId), timed(b, walletId)])

      const [earlier, later] = first.start <= second.start ? [first, second] : [second, first]
      expect(later.start).toBeGreaterThanOrEqual(earlier.end)
    })

    test('different wallets do not wait for each other', async () => {
      const [a, b] = instances()

      const [first, second] = await Promise.all([timed(a, `Wallet_${uuid()}`), timed(b, `Wallet_${uuid()}`)])

      expect(Math.max(first.start, second.start)).toBeLessThan(Math.min(first.end, second.end))
    })

    test('a caller that waits longer than the timeout gets 503, and the lock is free once the holder is done', async () => {
      const [a, b] = instances()
      const walletId = `Organization_${uuid()}`

      const holder = timed(a, walletId, 30, 2500)
      await sleep(300)
      await expect(timed(b, walletId, 1)).rejects.toBeInstanceOf(ServiceUnavailableException)
      await holder

      await expect(timed(b, walletId, 1, 10)).resolves.toBeDefined()
    })

    test('the lock is released when the operation fails', async () => {
      const [a, b] = instances()
      const walletId = `Organization_${uuid()}`

      await expect(a.runExclusive(walletId, 30, () => Promise.reject(new Error('preparation failed')))).rejects.toThrow(
        'preparation failed',
      )

      await expect(timed(b, walletId, 1, 10)).resolves.toBeDefined()
    })
  })

  describe('POST /prepare-wallet', () => {
    let nestApp: INestApplication
    let app: Server

    beforeAll(async () => {
      await ormSchemaGenerator.refresh()
      nestApp = await startTestApp()
      app = nestApp.getHttpServer() as Server
    })

    afterAll(async () => {
      await sleep(2000)
      await nestApp.close()
    })

    test('ten concurrent calls for one shared wallet all get the fully prepared wallet', async () => {
      // Every Admin acts in the shared Administration wallet
      const tokens = await Promise.all(Array.from({ length: 10 }, () => createAuthToken(uuid(), Role.Admin)))
      const schemaName = `Diploma-${uuid()}`
      const body = {
        schemas: [
          {
            name: schemaName,
            fields: ['name'],
            registrations: [{ protocol: 'OpenId4VC', credentialFormat: 'vc+sd-jwt', network: 'key' }],
          },
        ],
      }

      const responses = await Promise.all(
        tokens.map((token) =>
          // As the web UI sends it: multipart, with `schemas` as JSON
          request(app)
            .post('/prepare-wallet')
            .auth(token, { type: 'bearer' })
            .field('schemas', JSON.stringify(body.schemas)),
        ),
      )

      expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201))
      const mainDids = new Set(responses.map((response) => response.body.did as string))
      expect(mainDids.size).toBe(1)

      // Exactly one call created each DID; every other call found the wallet already prepared
      const statusesOf = (method: string) =>
        responses.map(
          (response) =>
            (response.body.dids as Array<{ method: string; status: string }>).find((d) => d.method === method)?.status,
        )
      for (const { method } of responses[0].body.dids as Array<{ method: string }>) {
        expect(statusesOf(method).filter((status) => status === 'created').length).toBeLessThanOrEqual(1)
      }
      expect(statusesOf('key').filter((status) => status === 'created')).toHaveLength(1)

      const ownKeyDids = await request(app)
        .get('/dids')
        .query({ own: true, method: 'key' })
        .auth(tokens[0], { type: 'bearer' })
      expect((ownKeyDids.body as Array<{ id: string }>).map(({ id }) => id)).toEqual([...mainDids])

      const schemas = await orm.em.fork().find(Schema, { name: schemaName }, { populate: ['registrations'] })
      expect(schemas).toHaveLength(1)
      expect(schemas[0].registrations).toHaveLength(1)
    })
  })
})
