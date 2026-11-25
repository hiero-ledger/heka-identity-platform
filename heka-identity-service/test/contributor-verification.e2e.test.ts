import * as crypto from 'crypto'
import * as http from 'http'
import { AddressInfo, Server } from 'net'

import { Agent, Kms, SdJwtVcRecord } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { getListFromStatusListJWT } from '@owf/token-status-list'
import * as openpgp from 'openpgp'
import request from 'supertest'
import { vi } from 'vitest'

import { Role } from 'src/common/auth'
import { User } from 'src/common/entities'
import { DidMethod, OpenId4VCCredentialRegistrationFormat, ProtocolType } from 'src/common/types'
import { ContributorCredentialIssuance } from 'src/contributor-credential/contributor-credential-issuance.entity'
import { ContributorAuditEvent, ContributorBinding } from 'src/contributor-onboarding'
import { OAuthLinkAttempt } from 'src/contributor-onboarding/oauth-link-attempt.entity'
import { GpgChallenge } from 'src/gpg-challenge/gpg-challenge.entity'
import { TokenStatus } from 'src/revocation'
import { ADMINISTRATION_WALLET_ID } from 'src/utils/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, SchemaUtilities, startTestApp, UserUtilities, waitUntil } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

// Contributor verification is optional: `ConditionalModule` reads the flag when the app module is
// evaluated, so it is set before the imports above run. The rest of the env is restored afterwards.
const originalEnv = vi.hoisted(() => {
  const original = { ...process.env }
  process.env.CONTRIBUTOR_VERIFICATION_ENABLED = 'true'
  return original
})

const CLIENT_ID = 'e2e-github-client'
const CLIENT_SECRET = 'e2e-github-secret'
/** The issuer organization. Its DID is pinned once an OrgAdmin has created it; until then, one it doesn't hold. */
const ORG_ID = `contributors-${uuid()}`
const UNHELD_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const SCHEMA_FIELDS = ['githubAccountId', 'githubUsername', 'gpgFingerprint', 'verifiedAt']
const DAY_MS = 24 * 60 * 60 * 1000

interface GithubStub {
  server: http.Server
  url: string
  /** access token -> GitHub user */
  tokens: Map<string, { id: number; login: string }>
  /** code -> access token */
  codes: Map<string, string>
  /** login -> numeric id for GET /users/:login */
  users: Map<string, number>
  /** login -> armored public keys for GET /:login.gpg */
  gpg: Map<string, string>
  /** code -> expected S256 challenge */
  challenges: Map<string, string>
  /** tokens revoked through DELETE /applications/:client_id/token with the app's credentials */
  revoked: string[]
}

/** GitHub's OAuth token endpoint (with the S256 PKCE check), user API, token revocation and .gpg key files. */
function startGithubStub(): Promise<GithubStub> {
  const stub: Omit<GithubStub, 'server' | 'url'> = {
    tokens: new Map(),
    codes: new Map(),
    users: new Map(),
    gpg: new Map(),
    challenges: new Map(),
    revoked: [],
  }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub')
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(data))
      }
      if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
        const params = JSON.parse(body || '{}') as Record<string, string>
        const token = stub.codes.get(params.code)
        if (!token) return json(200, { error: 'bad_verification_code' })
        const expected = stub.challenges.get(params.code)
        const actual = crypto
          .createHash('sha256')
          .update(params.code_verifier ?? '')
          .digest('base64url')
        if (expected && actual !== expected) return json(200, { error: 'invalid_grant' })
        stub.codes.delete(params.code)
        return json(200, { access_token: token, token_type: 'bearer', scope: '' })
      }
      if (req.method === 'GET' && url.pathname === '/user') {
        const user = stub.tokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
        return user ? json(200, user) : json(401, { message: 'Bad credentials' })
      }
      if (req.method === 'DELETE' && url.pathname === `/applications/${CLIENT_ID}/token`) {
        const basic = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
        if (req.headers.authorization !== basic) return json(401, { message: 'Bad credentials' })
        stub.revoked.push((JSON.parse(body || '{}') as { access_token?: string }).access_token ?? '')
        res.writeHead(204)
        return res.end()
      }
      const userMatch = url.pathname.match(/^\/users\/([^/]+)$/)
      if (req.method === 'GET' && userMatch) {
        const id = stub.users.get(decodeURIComponent(userMatch[1]))
        return id === undefined ? json(404, { message: 'Not Found' }) : json(200, { id, login: userMatch[1] })
      }
      const gpgMatch = url.pathname.match(/^\/([^/]+)\.gpg$/)
      if (req.method === 'GET' && gpgMatch) {
        const keys = stub.gpg.get(decodeURIComponent(gpgMatch[1]))
        if (!keys) {
          res.writeHead(404)
          return res.end('Not Found')
        }
        res.writeHead(200, { 'content-type': 'application/pgp-keys' })
        return res.end(keys)
      }
      json(404, { message: 'stub: no route' })
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ ...stub, server, url: `http://127.0.0.1:${port}` })
    }),
  )
}

function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('E2E contributor verification (stubbed GitHub)', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let app: Server
  let gh: GithubStub
  let holder: Agent<TestAgentModulesMap>
  // One agent store for every app instance, so a restarted app sees the tenants of the previous one
  const storeId = `tenant-${uuid()}`

  const aliceSub = `alice-${uuid()}`
  let aliceToken: string
  let aliceKey: { privateKey: string; publicKey: string }

  // Set by the issuer setup test
  let orgAdminToken: string
  let issuerDid: string
  let supportedCredentialId: string
  // Set by the offer test
  let aliceCredential: { issuanceSessionId: string; statusList: { idx: number; uri: string } }

  beforeAll(async () => {
    gh = await startGithubStub()
    process.env.GITHUB_CLIENT_ID = CLIENT_ID
    process.env.GITHUB_CLIENT_SECRET = CLIENT_SECRET
    process.env.GITHUB_CALLBACK_URL = 'http://localhost:8000/github/callback'
    process.env.GITHUB_OAUTH_AUTHORIZE_URL = `${gh.url}/login/oauth/authorize`
    process.env.GITHUB_OAUTH_TOKEN_URL = `${gh.url}/login/oauth/access_token`
    process.env.GITHUB_USER_API_URL = `${gh.url}/user`
    process.env.GITHUB_GPG_KEY_BASE_URL = gh.url
    process.env.CONTRIBUTOR_ISSUER_ORG_ID = ORG_ID
    process.env.CONTRIBUTOR_ISSUER_DID = UNHELD_DID

    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()

    holder = createAgent()
    await holder.initialize()

    nestApp = await startTestApp({ storeId })
    app = nestApp.getHttpServer() as Server

    aliceToken = await createAuthToken(aliceSub, Role.User)
    aliceKey = await openpgp.generateKey({ userIDs: [{ name: 'Alice', email: 'alice@example.com' }] })
    gh.gpg.set('alice', aliceKey.publicKey)
    gh.users.set('alice', 1001)
    gh.tokens.set('tok-alice', { id: 1001, login: 'alice' })
  }, 120_000)

  afterAll(async () => {
    await nestApp?.close()
    await holder?.shutdown()
    gh?.server.close()
    await ormSchemaGenerator?.clear()
    await orm?.close(true)
    process.env = originalEnv
  })

  /** Another app instance on the same database and agent store, which reads the configuration again. */
  async function restartApp() {
    await sleep(2000)
    await nestApp.close()
    nestApp = await startTestApp({ storeId })
    app = nestApp.getHttpServer() as Server
  }

  function offer(token: string) {
    return request(app).post('/v2/contributor-credential/offer').auth(token, { type: 'bearer' })
  }

  function offerState(token: string, issuanceSessionId: string) {
    return request(app).get(`/v2/contributor-credential/offer/${issuanceSessionId}`).auth(token, { type: 'bearer' })
  }

  /** The organization's view of an issuance session, as its issued-credential list shows it. */
  async function issuedSession(issuanceSessionId: string) {
    const issued = await request(app)
      .get('/openid4vc/issuance-session')
      .query({ publicIssuerId: issuerDid })
      .auth(orgAdminToken, { type: 'bearer' })
    expect(issued.status).toBe(200)
    return (issued.body as Array<Record<string, unknown>>).find(({ id }) => id === issuanceSessionId)
  }

  /** Receives an offer with the Credo holder, the stand-in for a wallet; returns the SD-JWT VC. */
  async function receive(credentialOffer: string, txCode: string) {
    const resolved = await holder.openid4vc.holder.resolveCredentialOffer(credentialOffer)
    const tokenResponse = await holder.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolved, txCode })
    const holderKey = await holder.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const result = await holder.openid4vc.holder.requestCredentials({
      resolvedCredentialOffer: resolved,
      credentialBindingResolver: () => ({ method: 'jwk', keys: [Kms.PublicJwk.fromPublicJwk(holderKey.publicJwk)] }),
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
    })
    expect(result.credentials).toHaveLength(1)
    return (result.credentials[0].record as SdJwtVcRecord).firstCredential
  }

  async function statusOf(statusList: { idx: number; uri: string }) {
    const token = await request(app).get(`/token-status-lists/${statusList.uri.split('/').pop()}`)
    expect(token.status).toBe(200)
    return getListFromStatusListJWT(token.text).getStatus(statusList.idx)
  }

  /** Links GitHub and completes the GPG verification for a new user. */
  async function verifiedContributor(login: string, githubAccountId: number) {
    const sub = `${login}-${uuid()}`
    const token = await createAuthToken(sub, Role.User)
    const key = await openpgp.generateKey({ userIDs: [{ name: login }] })
    gh.gpg.set(login, key.publicKey)
    gh.users.set(login, githubAccountId)
    gh.tokens.set(`tok-${login}`, { id: githubAccountId, login })
    expect((await link(token, `tok-${login}`)).status).toBe(200)
    const challenge = await requestChallenge(token)
    const signature = await clearSign(challenge.nonce, key.privateKey)
    expect((await verify(token, challenge.challengeId, signature)).status).toBe(200)
    return { sub, token }
  }

  async function startLink(token: string) {
    const res = await request(app).post('/v2/contributor-onboarding/github/link/start').auth(token, { type: 'bearer' })
    expect(res.status).toBe(200)
    const url = new URL(res.body.authorizationUrl as string)
    return { url, state: url.searchParams.get('state')!, challenge: url.searchParams.get('code_challenge')! }
  }

  function callback(token: string, code: string, state: string) {
    return request(app)
      .post('/v2/contributor-onboarding/github/link/callback')
      .auth(token, { type: 'bearer' })
      .send({ code, state })
  }

  /** Starts a link and lets GitHub answer it with `githubToken`'s user. */
  async function link(token: string, githubToken: string) {
    const { state, challenge } = await startLink(token)
    const code = `code-${uuid()}`
    gh.codes.set(code, githubToken)
    gh.challenges.set(code, challenge)
    return callback(token, code, state)
  }

  function status(token: string) {
    return request(app).get('/v2/contributor-onboarding/status').auth(token, { type: 'bearer' })
  }

  /**
   * Runs `start` while a transaction holds an EXCLUSIVE lock on `contributor_binding`: reads pass, writes
   * wait. The lock is released once `writers` requests wait on it, so each has passed its checks before
   * any of them writes, and the unique constraints decide.
   */
  async function withBindingWritesHeld<T>(writers: number, start: () => Promise<T>): Promise<T> {
    const lock = orm.em.fork()
    await lock.begin()
    await lock.execute('lock table "contributor_binding" in exclusive mode')
    const pending = start()
    try {
      await waitUntil(
        async () => {
          const [{ waiting }] = await orm.em
            .fork()
            .execute<Array<{ waiting: number }>>(
              `select count(*)::int as waiting from pg_locks where relation = 'contributor_binding'::regclass and not granted`,
            )
          return waiting >= writers
        },
        { timeout: 30_000, message: `${writers} binding writes did not wait on the lock` },
      )
    } finally {
      await lock.commit()
    }
    return pending
  }

  async function requestChallenge(token: string) {
    const res = await request(app).post('/v2/gpg-challenge/request').auth(token, { type: 'bearer' })
    expect(res.status).toBe(201)
    return res.body as { challengeId: string; nonce: string }
  }

  async function clearSign(text: string, armoredPrivateKey: string, date?: Date) {
    const signingKeys = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey })
    return openpgp.sign({ message: await openpgp.createCleartextMessage({ text }), signingKeys, date })
  }

  function verify(token: string, challengeId: string, signature: string) {
    return request(app)
      .post('/v2/gpg-challenge/verify')
      .auth(token, { type: 'bearer' })
      .send({ challengeId, signature })
  }

  test('link: PKCE without scopes; the state is single-use and bound to its user (400 otherwise); the token is revoked', async () => {
    const { url, state, challenge } = await startLink(aliceToken)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.has('scope')).toBe(false)

    const mallory = await createAuthToken(`mallory-${uuid()}`, Role.User)
    gh.codes.set('code-m', 'tok-alice')
    gh.challenges.set('code-m', challenge)
    const cross = await callback(mallory, 'code-m', state)
    expect(cross.status).toBe(400)

    gh.codes.set('code-a', 'tok-alice')
    gh.challenges.set('code-a', challenge)
    const ok = await callback(aliceToken, 'code-a', state)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ linked: true, githubUsername: 'alice' })
    expect(gh.revoked).toEqual(['tok-alice'])

    const replay = await callback(aliceToken, 'code-a', state)
    expect(replay.status).toBe(400)

    expect((await status(aliceToken)).body.verificationStatus).toBe('GitHubConnected')
  })

  test('GPG: a backdated signature by an expired key is rejected (400); a current one verifies; replay is rejected', async () => {
    const expired = await openpgp.generateKey({
      userIDs: [{ name: 'Alice old' }],
      date: new Date(Date.now() - 10 * DAY_MS),
      keyExpirationTime: 5 * 24 * 60 * 60,
    })
    gh.gpg.set('alice', `${aliceKey.publicKey}\n${expired.publicKey}`)
    const first = await requestChallenge(aliceToken)
    const backdated = await clearSign(first.nonce, expired.privateKey, new Date(Date.now() - 8 * DAY_MS))
    const rejected = await verify(aliceToken, first.challengeId, backdated)
    expect(rejected.status).toBe(400)
    expect(rejected.body.message).toMatch(/outside this challenge's window/)

    const second = await requestChallenge(aliceToken)
    const signature = await clearSign(second.nonce, aliceKey.privateKey)
    const verified = await verify(aliceToken, second.challengeId, signature)
    expect(verified.status).toBe(200)
    expect(verified.body).toMatchObject({ verified: true })

    const replay = await verify(aliceToken, second.challengeId, signature)
    expect(replay.status).toBe(400)
    expect((await status(aliceToken)).body.verificationStatus).toBe('GpgVerified')
  })

  test('issuer setup: 503 until an OrgAdmin has set up the wallet, the pinned DID, the schema and its registration', async () => {
    async function expectNotSetUp(what: RegExp) {
      const response = await offer(aliceToken)
      expect(response.status).toBe(503)
      expect(response.body.message).toMatch(/^The contributor credential issuer is not set up: /)
      expect(response.body.message).toMatch(what)
    }

    await expectNotSetUp(/the wallet of organization .+ does not exist yet/)

    orgAdminToken = await createAuthToken(`org-admin-${uuid()}`, Role.OrgAdmin, ORG_ID)
    issuerDid = (await UserUtilities.prepareWallet(app, orgAdminToken))!
    expect(issuerDid).toMatch(/^did:key:/)
    await expectNotSetUp(new RegExp(`${UNHELD_DID} is not an active DID of organization`))

    // The operator pins the organization's DID and restarts the service
    process.env.CONTRIBUTOR_ISSUER_DID = issuerDid
    await restartApp()
    await expectNotSetUp(/has no schema "GitHub Contributor"/)

    const schema = await SchemaUtilities.create(app, orgAdminToken, {
      name: 'GitHub Contributor',
      fields: SCHEMA_FIELDS,
    })
    expect(schema).toBeDefined()
    await expectNotSetUp(/is not registered for OpenID4VC vc\+sd-jwt/)

    const registered = await SchemaUtilities.register(app, orgAdminToken, schema!.id, {
      protocol: ProtocolType.Oid4vc,
      credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
      network: DidMethod.Key,
      did: issuerDid,
    })
    expect(registered).toBe(true)
    const { registrations } = await SchemaUtilities.get(app, orgAdminToken, schema!.id)
    supportedCredentialId = (registrations[0].credentials as { supportedCredentialId: string }).supportedCredentialId
  }, 120_000)

  test("offer: a Credo holder receives the SD-JWT VC signed by the pinned DID, with a status list entry; the claims only as disclosures; the offer's state", async () => {
    const response = await offer(aliceToken)
    expect(response.status).toBe(201)
    const { credentialOffer, txCode, expiresAt, issuanceSessionId } = response.body as Record<string, string>
    expect(txCode).toMatch(/^\d{8}$/)
    expect(credentialOffer).not.toContain(txCode)
    const lifetimeSeconds = (Date.parse(expiresAt) - Date.now()) / 1000
    expect(lifetimeSeconds).toBeGreaterThan(590)
    expect(lifetimeSeconds).toBeLessThanOrEqual(600)
    expect((await offerState(aliceToken, issuanceSessionId)).body).toEqual({ state: 'OfferCreated', expiresAt })

    const resolved = await holder.openid4vc.holder.resolveCredentialOffer(credentialOffer)
    await expect(holder.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolved })).rejects.toThrow(/tx_code/)

    const credential = await receive(credentialOffer, txCode)
    const payload = decodeJwtPart(credential.compact.split('~')[0].split('.')[1])
    expect(payload.vct).toBe('GitHub Contributor')
    expect(payload.iss).toBe(issuerDid)
    expect(typeof payload.exp).toBe('number')
    expect((payload.cnf as { jwk?: unknown }).jwk).toBeDefined()
    const statusList = (payload.status as { status_list: { idx: number; uri: string } }).status_list
    expect(statusList).toEqual({
      idx: expect.any(Number),
      uri: expect.stringMatching(/\/token-status-lists\/[0-9a-f-]{36}$/),
    })
    expect(payload).not.toHaveProperty('githubAccountId')
    expect(payload).not.toHaveProperty('githubUsername')
    expect(payload).not.toHaveProperty('gpgFingerprint')
    expect(payload).not.toHaveProperty('walletId')
    expect(payload.verifiedAt).toEqual(expect.any(String))
    expect(credential.prettyClaims).toMatchObject({ githubAccountId: '1001', githubUsername: 'alice' })
    expect(credential.prettyClaims).not.toHaveProperty('walletId')

    // The route reports the issuance session's own state, as the organization's list does. Not asserted to be
    // `Completed`: test-app.ts registers two OID4VC routers, and the second answer to the credential request
    // marks the session `Error`.
    const { state } = (await offerState(aliceToken, issuanceSessionId)).body as { state: string }
    expect(state).not.toBe('OfferCreated')
    expect((await issuedSession(issuanceSessionId))?.state).toBe(state)
    const mallory = await createAuthToken(`mallory-${uuid()}`, Role.User)
    expect((await offerState(mallory, issuanceSessionId)).status).toBe(404)
    expect((await offerState(aliceToken, uuid())).status).toBe(404)

    aliceCredential = { issuanceSessionId, statusList }
  }, 120_000)

  test("the organization issuer's credential configurations are untouched by offers and by a restart", async () => {
    const other = await SchemaUtilities.create(app, orgAdminToken, { name: `Other ${uuid()}`, fields: ['a', 'b'] })
    expect(
      await SchemaUtilities.register(app, orgAdminToken, other!.id, {
        protocol: ProtocolType.Oid4vc,
        credentialFormat: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
        network: DidMethod.Key,
        did: issuerDid,
      }),
    ).toBe(true)
    const configurations = async () => {
      const issuers = await request(app)
        .get('/openid4vc/issuer')
        .query({ publicIssuerId: issuerDid })
        .auth(orgAdminToken, { type: 'bearer' })
      expect(issuers.status).toBe(200)
      return (issuers.body as Array<{ credentialsSupported: unknown[] }>)[0].credentialsSupported
    }
    const before = await configurations()
    expect(before).toHaveLength(2)

    expect((await offer(aliceToken)).status).toBe(201)
    await restartApp()
    expect((await offer(aliceToken)).status).toBe(201)

    expect(await configurations()).toEqual(before)
  }, 120_000)

  test("revocation: an OrgAdmin finds the credential in the organization's issued list and revokes it", async () => {
    const session = await issuedSession(aliceCredential.issuanceSessionId)
    expect(session).toMatchObject({ revocable: true, revoked: false })
    expect(await statusOf(aliceCredential.statusList)).toBe(TokenStatus.Valid)

    const revoked = await request(app)
      .post(`/openid4vc/issuance-session/${aliceCredential.issuanceSessionId}/revoke`)
      .auth(orgAdminToken, { type: 'bearer' })
    expect(revoked.status).toBe(200)

    expect(await issuedSession(aliceCredential.issuanceSessionId)).toMatchObject({ revocable: true, revoked: true })
    expect(await statusOf(aliceCredential.statusList)).toBe(TokenStatus.Invalid)
  })

  test('two users linking one GitHub account at once: one gets it, the other 409', async () => {
    gh.tokens.set('tok-shared', { id: 777, login: 'shared' })
    const carol = await createAuthToken(`carol-${uuid()}`, Role.User)
    const dave = await createAuthToken(`dave-${uuid()}`, Role.User)

    const responses = await withBindingWritesHeld(2, () =>
      Promise.all([link(carol, 'tok-shared'), link(dave, 'tok-shared')]),
    )

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const conflict = responses.find((r) => r.status === 409)?.body as { message: string }
    expect(conflict.message).toMatch(/already linked to another Heka user/)
  })

  test('one user linking two GitHub accounts at once: one link wins, the other 409', async () => {
    gh.tokens.set('tok-erin-1', { id: 881, login: 'erin-one' })
    gh.tokens.set('tok-erin-2', { id: 882, login: 'erin-two' })
    const erin = await createAuthToken(`erin-${uuid()}`, Role.User)

    const responses = await withBindingWritesHeld(2, () =>
      Promise.all([link(erin, 'tok-erin-1'), link(erin, 'tok-erin-2')]),
    )

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const conflict = responses.find((r) => r.status === 409)?.body as { message: string }
    expect(conflict.message).toMatch(/at the same time/)
    const winner = responses.find((r) => r.status === 200)?.body as { githubUsername: string }
    expect((await status(erin)).body).toMatchObject({ github: { username: winner.githubUsername } })
  })

  test('re-linking an existing binding to two GitHub accounts at once: one wins, the other 409', async () => {
    gh.tokens.set('tok-grace-a', { id: 891, login: 'grace-a' })
    gh.tokens.set('tok-grace-b', { id: 892, login: 'grace-b' })
    gh.tokens.set('tok-grace-c', { id: 893, login: 'grace-c' })
    const grace = await createAuthToken(`grace-${uuid()}`, Role.User)
    expect((await link(grace, 'tok-grace-a')).status).toBe(200)

    const responses = await withBindingWritesHeld(2, () =>
      Promise.all([link(grace, 'tok-grace-b'), link(grace, 'tok-grace-c')]),
    )

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const conflict = responses.find((r) => r.status === 409)?.body as { message: string }
    expect(conflict.message).toMatch(/at the same time/)
    const winner = responses.find((r) => r.status === 200)?.body as { githubUsername: string }
    expect((await status(grace)).body).toMatchObject({ github: { username: winner.githubUsername } })
    const events = (await status(grace)).body.auditEvents as Array<{ eventType: string; githubUsername: string }>
    expect(events.filter(({ eventType }) => eventType === 'BindingUpdated').map((e) => e.githubUsername)).toEqual([
      winner.githubUsername,
      'grace-a',
    ])
  })

  test('role change: the same OIDC subject as Admin keeps its binding and can link the same account again', async () => {
    const aliceAsAdmin = await createAuthToken(aliceSub, Role.Admin)

    const before = await status(aliceAsAdmin)
    expect(before.body.verificationStatus).toBe('GpgVerified')

    const relink = await link(aliceAsAdmin, 'tok-alice')
    expect(relink.status).toBe(200)

    const after = await status(aliceAsAdmin)
    expect(after.body.verificationStatus).toBe('GpgVerified')
    expect(after.body.binding.walletId).toBe(ADMINISTRATION_WALLET_ID)
  })

  test('unlink: 204, idempotent; issued credentials stay valid; the offer needs a binding again; linking again starts a new verification', async () => {
    const issued = await offer(aliceToken)
    expect(issued.status).toBe(201)
    const { issuanceSessionId } = issued.body as { issuanceSessionId: string }
    const pending = await requestChallenge(aliceToken)

    const unlink = await request(app).delete('/v2/contributor-onboarding/github').auth(aliceToken, { type: 'bearer' })
    expect(unlink.status).toBe(204)
    const again = await request(app).delete('/v2/contributor-onboarding/github').auth(aliceToken, { type: 'bearer' })
    expect(again.status).toBe(204)

    const unlinked = await status(aliceToken)
    expect(unlinked.body.verificationStatus).toBe('NotConnected')
    expect(unlinked.body.auditEvents[0]).toMatchObject({ eventType: 'BindingRemoved', githubAccountId: '1001' })
    const signature = await clearSign(pending.nonce, aliceKey.privateKey)
    expect((await verify(aliceToken, pending.challengeId, signature)).status).toBe(404)
    expect((await offer(aliceToken)).status).toBe(404)

    // Not revoked by the unlink; the record of the offer stays too
    expect(await issuedSession(issuanceSessionId)).toMatchObject({ revocable: true, revoked: false })
    expect((await offerState(aliceToken, issuanceSessionId)).status).toBe(200)

    expect((await link(aliceToken, 'tok-alice')).status).toBe(200)
    expect((await status(aliceToken)).body.verificationStatus).toBe('GitHubConnected')
  })

  test('deleting a user deletes its binding, challenges, link attempts and offer records; the audit log stays', async () => {
    const frank = await verifiedContributor('frank', 2001)
    expect((await offer(frank.token)).status).toBe(201)
    await startLink(frank.token)

    const em = orm.em.fork()
    const rowsOf = async () =>
      Promise.all([
        em.count(ContributorBinding, { user: frank.sub }),
        em.count(GpgChallenge, { user: frank.sub }),
        em.count(OAuthLinkAttempt, { user: frank.sub }),
        em.count(ContributorCredentialIssuance, { user: frank.sub }),
      ])
    expect((await rowsOf()).every((count) => count > 0)).toBe(true)
    const auditEvents = await em.count(ContributorAuditEvent, { userId: frank.sub })

    await em.nativeDelete(User, { id: frank.sub })

    expect(await rowsOf()).toEqual([0, 0, 0, 0])
    expect(await em.count(ContributorAuditEvent, { userId: frank.sub })).toBe(auditEvents)
  }, 120_000)

  test('no one outside the organization can sign as its issuer: a User 4xx, an Issuer of the organization 422', async () => {
    const forgedOffer = (token: string) =>
      request(app)
        .post('/openid4vc/issuance-session/offer')
        .auth(token, { type: 'bearer' })
        .send({
          publicIssuerId: issuerDid,
          credentials: [
            {
              credentialSupportedId: supportedCredentialId,
              format: 'vc+sd-jwt',
              issuer: { method: 'did', did: issuerDid },
              payload: {
                githubAccountId: '583231',
                githubUsername: 'octocat',
                gpgFingerprint: 'FORGED',
                verifiedAt: 'x',
              },
              disclosureFrame: {},
            },
          ],
        })

    const user = await createAuthToken(`user-${uuid()}`, Role.User)
    const asUser = await forgedOffer(user)
    expect(asUser.status).toBeGreaterThanOrEqual(400)
    expect(asUser.status).toBeLessThan(500)

    // An Issuer of the organization has a wallet of its own, without the organization's DID or issuer
    const orgIssuer = await createAuthToken(`issuer-${uuid()}`, Role.Issuer, ORG_ID)
    expect((await forgedOffer(orgIssuer)).status).toBe(404)
    // Last in this file: the lookalike issuer record also claims the DID's public OpenID4VCI path
    const lookalike = await request(app)
      .post('/openid4vc/issuer')
      .auth(orgIssuer, { type: 'bearer' })
      .send({
        publicIssuerId: issuerDid,
        credentialsSupported: [{ id: supportedCredentialId, format: 'vc+sd-jwt', vct: 'GitHub Contributor' }],
      })
    expect(lookalike.status).toBe(200)
    const forged = await forgedOffer(orgIssuer)
    expect(forged.status).toBe(422)
    expect(forged.body.message).toMatch(/not created in this wallet/)
  })
})
