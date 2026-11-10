import { Server } from 'net'

import { Agent, DidKey, KeyDidCreateOptions, Kms, SdJwtVcRecord } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { getListFromStatusListJWT } from '@sd-jwt/jwt-status-list'
import request from 'supertest'

import { DidKeyRegistrar } from 'common/did-registrar/methods'
import { Role } from 'src/common/auth'
import { TokenStatusList } from 'src/common/entities'
import { TokenStatus } from 'src/revocation'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp, waitUntil } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

const VCT = 'https://example.com/vct'

const decodeJwt = (jwt: string) => {
  const [header, payload] = jwt.split('.')
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
  }
}

interface TokenStatusReference {
  type: string
  location: string
  index: number
  indexes: number[]
}

const referenceOf = (response: request.Response): TokenStatusReference => {
  const metadata = response.body.issuanceSession.issuanceMetadata as {
    credentials: { credentialStatus: TokenStatusReference }[]
  }
  return metadata.credentials[0].credentialStatus
}

/**
 * Over the real stack: an SD-JWT VC issued through OID4VCI carries an IETF token status list reference; the
 * public token is signed with the credential's own issuer key; revoking the issuance session flips the entry,
 * and a Credo holder/verifier that re-fetches the list now rejects the credential.
 *
 * The holder fetches `APP_ENDPOINT/token-status-lists/:id` from this test app, so `APP_ENDPOINT` must point at
 * `EXPRESS_PORT` (as in CI).
 */
describe('Token status list (SD-JWT VC revocation)', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let app: Server
  let agent: Agent<TestAgentModulesMap>

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()

    agent = createAgent()
    await agent.initialize()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await sleep(2000)
    await nestApp.close()
    await agent.shutdown()
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  /** A did:key issuer DID + an OID4VC issuer with one `vc+sd-jwt` configuration, in the token's wallet. */
  async function createSdJwtIssuer(authToken: string): Promise<string> {
    const postDidResponse = await request(app)
      .post('/dids')
      .auth(authToken, { type: 'bearer' })
      .send({ method: 'key' })
      .expect(201)
    const issuerDid = postDidResponse.body.id as string

    await request(app)
      .post('/openid4vc/issuer')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerDid,
        credentialsSupported: [
          {
            id: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            vct: VCT,
            proof_types_supported: {
              jwt: { proof_signing_alg_values_supported: [Kms.KnownJwaSignatureAlgorithms.EdDSA] },
            },
          },
        ],
      })
      .expect(200)
    return issuerDid
  }

  function getSession(authToken: string, sessionId: string) {
    return request(app).get(`/openid4vc/issuance-session/${sessionId}`).auth(authToken, { type: 'bearer' }).expect(200)
  }

  function revoke(authToken: string, sessionId: string) {
    return request(app).post(`/openid4vc/issuance-session/${sessionId}/revoke`).auth(authToken, { type: 'bearer' })
  }

  function offer(authToken: string, issuerDid: string, credential: Record<string, unknown> = {}) {
    return request(app)
      .post('/openid4vc/issuance-session/offer')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerDid,
        credentials: [
          {
            credentialSupportedId: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            issuer: { method: 'did', did: issuerDid },
            payload: { first_name: 'John', last_name: 'Doe' },
            disclosureFrame: { _sd: ['last_name'] },
            ...credential,
          },
        ],
      })
  }

  async function acceptOffer(credentialOffer: string) {
    const holderKey = await agent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
    const holderDid = await agent.dids.create<KeyDidCreateOptions>({
      method: DidKeyRegistrar.method,
      options: { keyId: holderKey.keyId },
    })
    if (holderDid.didState.state !== 'finished' || !holderDid.didState.didDocument) throw new Error('no holder did')
    const holderDidUrl = holderDid.didState.didDocument.verificationMethod![0].id

    const resolvedOffer = await agent.openid4vc.holder.resolveCredentialOffer(credentialOffer)
    const tokenResponse = await agent.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const requested = await agent.openid4vc.holder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      credentialBindingResolver: () => ({ method: 'did', didUrls: [holderDidUrl] }),
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
    })
    const record = requested.credentials[0].record as SdJwtVcRecord
    await agent.sdJwtVc.store({ record })
    return record.firstCredential
  }

  /**
   * Present the stored SD-JWT VC to a Heka verifier (in a wallet of its own) over OID4VP (DCQL) and return the
   * session's final state.
   */
  async function presentToVerifier() {
    const authToken = await createAuthToken(uuid(), Role.User)
    const postDidResponse = await request(app).post('/dids').auth(authToken, { type: 'bearer' }).send({}).expect(201)
    const verifierId = postDidResponse.body.id as string
    await request(app)
      .post('/openid4vc/verifier')
      .auth(authToken, { type: 'bearer' })
      .send({ publicVerifierId: verifierId })
      .expect(200)

    const response = await request(app)
      .post('/openid4vc/verification-session/request')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicVerifierId: verifierId,
        requestSigner: { method: 'did', did: postDidResponse.body.authentication[0] },
        dcql: {
          query: {
            credentials: [
              {
                id: 'credential_1',
                format: 'vc+sd-jwt',
                meta: { vct_values: [VCT] },
                claims: [{ path: ['first_name'], id: 'first_name_claim' }],
              },
            ],
          },
        },
      })
      .expect(200)
    const sessionId = response.body.verificationSession.id as string

    const resolvedRequest = await agent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(
      response.body.authorizationRequest,
    )
    const selectedCredentials = agent.openid4vc.holder.selectCredentialsForDcqlRequest(
      resolvedRequest.dcql!.queryResult,
    )
    const accepted = await agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
      authorizationRequestPayload: resolvedRequest.authorizationRequestPayload,
      dcql: { credentials: selectedCredentials },
    })

    let state: string | undefined
    await waitUntil(
      async () => {
        const session = await request(app)
          .get(`/openid4vc/verification-session/${sessionId}`)
          .auth(authToken, { type: 'bearer' })
        state = session.body.state as string
        return state === 'ResponseVerified' || state === 'Error'
      },
      { message: 'Verification session did not finish' },
    )
    return { serverStatus: accepted.serverResponse?.status, state }
  }

  test('an SD-JWT VC references a signed token status list; revocation invalidates it', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)
    const issuerDidUrl = `${issuerDid}#${DidKey.fromDid(issuerDid).publicJwk.fingerprint}`

    // AC1: the offer reserves an entry in a list of the issuer key
    const offerResponse = await offer(issuerAuthToken, issuerDid).expect(200)
    const sessionId = offerResponse.body.issuanceSession.id as string
    expect(offerResponse.body.issuanceSession).toMatchObject({ revocable: true, revoked: false })
    const reference = referenceOf(offerResponse)
    expect(reference).toEqual({
      type: 'token-status-list',
      location: expect.stringMatching(/\/token-status-lists\/[0-9a-f-]{36}$/),
      index: expect.any(Number),
      indexes: [reference.index],
    })
    expect(reference.location.startsWith(`${process.env.APP_ENDPOINT ?? 'http://localhost:3000'}/`)).toBe(true)
    const listId = reference.location.split('/').pop() as string

    // AC2: the credential carries the status_list reference as an always-disclosed claim
    const credential = await acceptOffer(offerResponse.body.credentialOffer as string)
    expect(credential.payload.status).toEqual({ status_list: { idx: reference.index, uri: reference.location } })
    expect(credential.payload).toMatchObject({ vct: VCT, iss: issuerDid, first_name: 'John' })
    expect(credential.payload).not.toHaveProperty('last_name')
    expect(credential.prettyClaims).toMatchObject({ first_name: 'John', last_name: 'Doe' })

    // AC3: the public token is statuslist+jwt, signed by the credential's issuer key, entry valid
    const before = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(before.headers['content-type']).toMatch(/^application\/statuslist\+jwt/)
    expect(before.headers['cache-control']).toBe('max-age=300')
    const { header, payload } = decodeJwt(before.text)
    expect(header).toEqual({ typ: 'statuslist+jwt', alg: 'EdDSA', kid: issuerDidUrl })
    expect(payload).toEqual({
      iss: issuerDid,
      sub: reference.location,
      iat: expect.any(Number),
      ttl: 300,
      status_list: { bits: 1, lst: expect.any(String) },
    })
    expect(getListFromStatusListJWT(before.text).getStatus(reference.index)).toBe(TokenStatus.Valid)
    const issuerJwk = DidKey.fromDid(issuerDid).publicJwk
    const [encodedHeader, encodedPayload, signature] = before.text.split('.')
    const signatureValid = await agent.kms.verify({
      key: { publicJwk: issuerJwk.toJson() },
      algorithm: 'EdDSA',
      data: Uint8Array.from(Buffer.from(`${encodedHeader}.${encodedPayload}`)),
      signature: Uint8Array.from(Buffer.from(signature, 'base64url')),
    })
    expect(signatureValid.verified).toBe(true)

    // AC4: content negotiation and unknown lists
    await request(app).get(`/token-status-lists/${listId}`).set('Accept', '*/*').expect(200)
    await request(app).get(`/token-status-lists/${listId}`).set('Accept', 'application/statuslist+cwt').expect(406)
    await request(app).get(`/token-status-lists/${uuid()}`).expect(404)

    // AC5: a Credo verifier fetches the list and accepts the credential, and a Heka verifier accepts a presentation
    expect((await agent.sdJwtVc.verify({ compactSdJwtVc: credential.compact })).isValid).toBe(true)
    expect(await presentToVerifier()).toEqual({ serverStatus: 200, state: 'ResponseVerified' })

    expect((await getSession(issuerAuthToken, sessionId)).body).toMatchObject({ revocable: true, revoked: false })

    // AC6: revoke → the entry flips, the token is re-signed, the session reports revoked
    await revoke(issuerAuthToken, sessionId).expect(200)

    const after = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(after.text).not.toBe(before.text)
    expect(getListFromStatusListJWT(after.text).getStatus(reference.index)).toBe(TokenStatus.Invalid)
    expect(getListFromStatusListJWT(after.text).getStatus((reference.index + 1) % 100_000)).toBe(TokenStatus.Valid)

    expect((await getSession(issuerAuthToken, sessionId)).body).toMatchObject({ revocable: true, revoked: true })
    // The list call reads the status too. (Filtered by issuer, not by state: in this test app the issuance
    // session ends in `Error` after a successful credential request, which happens without status lists too.)
    const listed = await request(app)
      .get('/openid4vc/issuance-session')
      .query({ publicIssuerId: issuerDid })
      .auth(issuerAuthToken, { type: 'bearer' })
      .expect(200)
    expect(listed.body).toEqual([expect.objectContaining({ id: sessionId, revocable: true, revoked: true })])

    // AC7: a second revoke is a 409 and leaves the list as it was
    const again = await revoke(issuerAuthToken, sessionId).expect(409)
    expect(again.body.message).toBe('Credential is already revoked')
    expect((await request(app).get(`/token-status-lists/${listId}`).expect(200)).text).toBe(after.text)

    // AC8: verification now fails on status, and a presentation of the revoked credential is rejected
    const reverified = await agent.sdJwtVc.verify({ compactSdJwtVc: credential.compact })
    expect(reverified.isValid).toBe(false)
    expect(reverified.isValid ? undefined : reverified.error.message).toMatch(/status/i)
    const rejected = await presentToVerifier()
    expect(rejected.state).toBe('Error')
    expect(rejected.serverStatus).not.toBe(200)
  })

  const listIdOf = (response: request.Response) => referenceOf(response).location.split('/').pop() as string
  const bitsSetIn = (base64: string) =>
    Buffer.from(base64, 'base64').reduce((count, byte) => count + byte.toString(2).replace(/0/g, '').length, 0)
  const listsOf = (issuerDid: string) =>
    orm.em.fork().find(TokenStatusList, { issuer: issuerDid }, { orderBy: { id: 'asc' } })

  test('parallel first offers for a key share one list, and later bursts never fail', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)

    // Burst 1 with no list yet: list creation is serialised per signing key, so exactly one list is created
    const coldBurst = await Promise.all(Array.from({ length: 24 }, () => offer(issuerAuthToken, issuerDid)))
    expect(coldBurst.map((response) => response.statusCode)).toEqual(Array(24).fill(200))
    // Burst 2 on the existing list
    const warmBurst = await Promise.all(Array.from({ length: 24 }, () => offer(issuerAuthToken, issuerDid)))
    expect(warmBurst.map((response) => response.statusCode)).toEqual(Array(24).fill(200))

    const references = [...coldBurst, ...warmBurst].map(referenceOf)
    expect(new Set(references.map((reference) => reference.location)).size).toBe(1)
    expect(new Set(references.map((reference) => reference.index)).size).toBe(48)

    // The persisted bitmap agrees: 48 allocations, 48 bits — no lost read-modify-write
    const lists = await listsOf(issuerDid)
    expect(lists).toHaveLength(1)
    expect(lists[0].allocatedCount).toBe(48)
    expect(bitsSetIn(lists[0].allocatedBitmap)).toBe(48)
  })

  test('a full list is followed by exactly one new list, also under parallel offers', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)
    const first = await offer(issuerAuthToken, issuerDid).expect(200)

    // Mark the list full (allocation only looks at allocatedCount against size)
    const em = orm.em.fork()
    const full = await em.findOneOrFail(TokenStatusList, { id: listIdOf(first) })
    full.allocatedCount = full.size
    await em.flush()

    const burst = await Promise.all(Array.from({ length: 20 }, () => offer(issuerAuthToken, issuerDid)))
    expect(burst.map((response) => response.statusCode)).toEqual(Array(20).fill(200))
    const nextListIds = new Set(burst.map(listIdOf))
    expect(nextListIds.size).toBe(1)
    expect(nextListIds.has(full.id)).toBe(false)

    // With two lists for the key, further parallel offers neither deadlock nor touch the full list
    const again = await Promise.all(Array.from({ length: 20 }, () => offer(issuerAuthToken, issuerDid)))
    expect(again.map((response) => response.statusCode)).toEqual(Array(20).fill(200))
    expect(new Set(again.map(listIdOf))).toEqual(nextListIds)

    const lists = await listsOf(issuerDid)
    expect(lists).toHaveLength(2)
    const next = lists.find((list) => list.id !== full.id)!
    expect(next.allocatedCount).toBe(40)
    expect(new Set([...burst, ...again].map((response) => referenceOf(response).index)).size).toBe(40)
  })

  test('concurrent revocations: different sessions both stick, the same session answers 200 once', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)
    const [kept, revokeA, revokeB, revokeTwice] = await Promise.all(
      Array.from({ length: 4 }, () => offer(issuerAuthToken, issuerDid).expect(200)),
    )
    const listId = listIdOf(kept)

    // Two revocations racing on the same list both land in the re-signed token
    await Promise.all(
      [revokeA, revokeB].map((response) =>
        revoke(issuerAuthToken, response.body.issuanceSession.id as string).expect(200),
      ),
    )
    const token = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    const statusList = getListFromStatusListJWT(token.text)
    expect(statusList.getStatus(referenceOf(revokeA).index)).toBe(TokenStatus.Invalid)
    expect(statusList.getStatus(referenceOf(revokeB).index)).toBe(TokenStatus.Invalid)
    expect(statusList.getStatus(referenceOf(kept).index)).toBe(TokenStatus.Valid)

    // Five parallel revokes of one session: the check runs under the list's row lock, so exactly one wins
    const sessionId = revokeTwice.body.issuanceSession.id as string
    const responses = await Promise.all(Array.from({ length: 5 }, () => revoke(issuerAuthToken, sessionId)))
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409, 409, 409, 409])
    const after = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(getListFromStatusListJWT(after.text).getStatus(referenceOf(revokeTwice).index)).toBe(TokenStatus.Invalid)
  })

  test('another member of the same organization wallet can revoke the credential (shared lists)', async () => {
    const orgId = uuid()
    const orgAdminAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, orgId)
    const orgManagerAuthToken = await createAuthToken(uuid(), Role.OrgManager, orgId)
    const issuerDid = await createSdJwtIssuer(orgAdminAuthToken)

    const offered = await offer(orgAdminAuthToken, issuerDid).expect(200)
    const sessionId = offered.body.issuanceSession.id as string
    // The second member's offers share the first member's list: it belongs to the wallet, not to the user
    const offeredByManager = await offer(orgManagerAuthToken, issuerDid).expect(200)
    expect(referenceOf(offeredByManager).location).toBe(referenceOf(offered).location)

    await revoke(orgManagerAuthToken, sessionId).expect(200)

    const listId = referenceOf(offered).location.split('/').pop() as string
    const token = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(getListFromStatusListJWT(token.text).getStatus(referenceOf(offered).index)).toBe(TokenStatus.Invalid)
    expect((await getSession(orgAdminAuthToken, sessionId)).body).toMatchObject({ revocable: true, revoked: true })

    // A user of another wallet sees neither the session nor the list
    const outsiderAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    await revoke(outsiderAuthToken, sessionId).expect(404)
  })

  test('a session with an issued SD-JWT VC is deleted only after revocation; a pending offer any time', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)
    const deleteSession = (sessionId: string) =>
      request(app).delete(`/openid4vc/issuance-session/${sessionId}`).auth(issuerAuthToken, { type: 'bearer' })

    // A pending offer: no credential exists yet, so cancelling it needs no revocation
    const pending = await offer(issuerAuthToken, issuerDid).expect(200)
    await deleteSession(pending.body.issuanceSession.id as string).expect(204)
    await deleteSession(pending.body.issuanceSession.id as string).expect(404)

    // An issued credential: the session is its only status list reference, so it must be revoked first
    const issued = await offer(issuerAuthToken, issuerDid).expect(200)
    const sessionId = issued.body.issuanceSession.id as string
    await acceptOffer(issued.body.credentialOffer as string)

    const refused = await deleteSession(sessionId).expect(409)
    expect(refused.body.message).toBe(
      'Revoke the issued SD-JWT VC before deleting its issuance session: without the session it cannot be revoked',
    )
    expect((await getSession(issuerAuthToken, sessionId)).body).toMatchObject({ revocable: true, revoked: false })

    await revoke(issuerAuthToken, sessionId).expect(200)
    await deleteSession(sessionId).expect(204)
    await revoke(issuerAuthToken, sessionId).expect(404)
  })

  test('an offer cannot set or hide the status claim (400)', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)

    await offer(issuerAuthToken, issuerDid, {
      payload: { first_name: 'John', status: { status_list: { idx: 0, uri: 'https://elsewhere.example/list' } } },
    }).expect(400)
    await offer(issuerAuthToken, issuerDid, { disclosureFrame: { _sd: ['status'] } }).expect(400)
  })

  test('an SD-JWT VC offer for an issuer DID of another wallet is rejected (422)', async () => {
    const issuerAuthToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
    const issuerDid = await createSdJwtIssuer(issuerAuthToken)
    const holderKey = await agent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
    const foreignDid = await agent.dids.create<KeyDidCreateOptions>({
      method: DidKeyRegistrar.method,
      options: { keyId: holderKey.keyId },
    })

    const response = await offer(issuerAuthToken, issuerDid, {
      issuer: { method: 'did', did: foreignDid.didState.did },
    }).expect(422)
    expect(response.body.message).toBe('Issuer DID is not controlled by this wallet')
  })
})
