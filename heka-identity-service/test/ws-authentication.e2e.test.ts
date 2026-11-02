import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request, { WSChain } from 'superwstest'
import { WebSocket } from 'ws'

import { WEBSOCKET_BEARER_PROTOCOL } from 'src/common/auth'
import { TOKEN_EXPIRED_CLOSE_CODE, UNAUTHORIZED_CLOSE_CODE } from 'src/common/notification/notification.gateway'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import {
  initializeMikroOrm,
  signJwt,
  startTestApp,
  testOidcAudience,
  testOidcIssuer,
  waitForNotificationSocket,
} from './helpers'

describe('E2E WebSocket authentication', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  let userWebSocket: WSChain | null

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema

    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  beforeEach(() => {
    userWebSocket = null
  })

  afterEach(async () => {
    if (userWebSocket) {
      await userWebSocket.close().expectClosed()
    }
  })

  afterAll(async () => {
    await nestApp.close()

    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  test('authenticates for valid bearer token with Admin role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Administrator',
        type: 'access',
        roles: ['Admin'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with OrgAdmin role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgAdmin'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with OrgManager role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgManager'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with OrgMember role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['OrgMember'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with Issuer role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with Verifier role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Pharmacist',
        type: 'access',
        roles: ['Verifier'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('authenticates for valid bearer token with User role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await sleep(10)
    await userWebSocket.exec((ws) => {
      expect(ws.readyState).toBe(WebSocket.OPEN)
    })
  })

  test('rejects if bearer token does not contain iss', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token iss is not Heka', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: uuid(),
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token does not contain aud', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token aud is not Heka Identity Service', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: 'Heka Mobile App',
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token has expired', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1s',
      },
    )

    // Wait for the token to expire
    await sleep(2000)

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token roles contains zero elements', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: [],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token roles contains multiple elements', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['Admin', 'User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  // An organization in a User token is ignored, not rejected: a provider adds one for a member without an organization role
  test('ignores org_id in a bearer token with User role', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
        org_id: uuid(),
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await waitForNotificationSocket(nestApp, userAuthToken)
  })

  test('rejects if bearer token does not contain org_id when must', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'Doctor',
        type: 'access',
        roles: ['Issuer'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  test('rejects if bearer token signature is invalid', async () => {
    const userAuthToken = await signJwt(
      {
        name: 'John',
        type: 'access',
        roles: ['User'],
      },
      {
        subject: uuid(),
        issuer: testOidcIssuer,
        audience: testOidcAudience,
        expiresIn: '1w',
      },
      { untrusted: true },
    )

    userWebSocket = request(app)
      .ws('/notifications')
      .set('Authorization', `Bearer ${userAuthToken}`)
      .expectUpgrade((upgradeResponse) => {}) // eslint-disable-line @typescript-eslint/no-empty-function

    await userWebSocket

    await userWebSocket.expectClosed(3000)
  })

  // Browsers cannot set headers on a WebSocket, so the web UI sends the token as a subprotocol
  describe('token in Sec-WebSocket-Protocol', () => {
    const signUserToken = (expiresIn = '1w', options?: { untrusted: boolean }) =>
      signJwt(
        { name: 'John', type: 'access', roles: ['User'] },
        { subject: uuid(), issuer: testOidcIssuer, audience: testOidcAudience, expiresIn },
        options,
      )

    test('authenticates and echoes only the bearer marker as the protocol', async () => {
      const userAuthToken = await signUserToken()

      userWebSocket = request(app).ws('/notifications', [WEBSOCKET_BEARER_PROTOCOL, userAuthToken])
      await userWebSocket

      await waitForNotificationSocket(nestApp, userAuthToken)
      await userWebSocket.exec((ws) => {
        expect(ws.readyState).toBe(WebSocket.OPEN)
        expect(ws.protocol).toBe(WEBSOCKET_BEARER_PROTOCOL)
      })
    })

    test('rejects an invalid token', async () => {
      const userAuthToken = await signUserToken('1w', { untrusted: true })

      userWebSocket = request(app).ws('/notifications', [WEBSOCKET_BEARER_PROTOCOL, userAuthToken])
      await userWebSocket

      await userWebSocket.expectClosed(UNAUTHORIZED_CLOSE_CODE)
    })

    test('rejects the bearer marker without a token', async () => {
      userWebSocket = request(app).ws('/notifications', [WEBSOCKET_BEARER_PROTOCOL])
      await userWebSocket

      await userWebSocket.expectClosed(UNAUTHORIZED_CLOSE_CODE)
    })

    test('closes the socket when the token expires', async () => {
      const userAuthToken = await signUserToken('3s')

      userWebSocket = request(app).ws('/notifications', [WEBSOCKET_BEARER_PROTOCOL, userAuthToken])
      await userWebSocket

      await waitForNotificationSocket(nestApp, userAuthToken)
      await userWebSocket.expectClosed(TOKEN_EXPIRED_CLOSE_CODE, 'Token expired')
    })
  })
})
