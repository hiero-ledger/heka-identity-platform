import { Server } from 'net'

import { Agent, DidKey, KeyDidCreateOptions, Kms, SdJwtVcRecord } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { getListFromStatusListJWT } from '@sd-jwt/jwt-status-list'
import request from 'supertest'

import { DidKeyRegistrar } from 'common/did-registrar/methods'
import { Role } from 'src/common/auth'
import { TokenStatus } from 'src/revocation'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

const decodeJwt = (jwt: string) => {
  const [header, payload] = jwt.split('.')
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
  }
}

/**
 * E7 over the real stack: an SD-JWT VC issued through OID4VCI carries an IETF token-status-list
 * reference; the public token is signed with the credential's own issuer key; revoking the issuance
 * session flips the entry, and a Credo holder/verifier that re-fetches the list now rejects the credential.
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

  test('an SD-JWT VC references a signed token status list; revocation invalidates it', async () => {
    const issuerAccountAuthToken = await createAuthToken(uuid(), Role.Admin)

    const postDidResponse = await request(app)
      .post('/dids')
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .send({ method: 'key' })
    expect(postDidResponse.statusCode).toBe(201)
    const issuerDid = postDidResponse.body.id as string
    const issuerDidKey = DidKey.fromDid(issuerDid)

    const issuerResponse = await request(app)
      .post('/openid4vc/issuer')
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerDid,
        credentialsSupported: [
          {
            id: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            vct: 'https://example.com/vct',
            proof_types_supported: {
              jwt: { proof_signing_alg_values_supported: [Kms.KnownJwaSignatureAlgorithms.EdDSA] },
            },
          },
        ],
      })
    expect(issuerResponse.statusCode).toBe(200)

    const offerResponse = await request(app)
      .post('/openid4vc/issuance-session/offer')
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerDid,
        credentials: [
          {
            credentialSupportedId: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            issuer: { method: 'did', did: issuerDidKey.did },
            payload: { first_name: 'John' },
          },
        ],
      })
    expect(offerResponse.statusCode).toBe(200)
    const sessionId = offerResponse.body.issuanceSession.id as string

    // holder accepts the offer
    const holderKey = await agent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
    const holderDid = await agent.dids.create<KeyDidCreateOptions>({
      method: DidKeyRegistrar.method,
      options: { keyId: holderKey.keyId },
    })
    if (holderDid.didState.state !== 'finished' || !holderDid.didState.didDocument) throw new Error('no holder did')
    const holderDidUrl = holderDid.didState.didDocument.verificationMethod![0].id

    const resolvedOffer = await agent.openid4vc.holder.resolveCredentialOffer(offerResponse.body.credentialOffer)
    const tokenResponse = await agent.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const requested = await agent.openid4vc.holder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      credentialBindingResolver: () => ({ method: 'did', didUrls: [holderDidUrl] }),
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
    })
    const credential = (requested.credentials[0].record as SdJwtVcRecord).firstCredential

    // the credential carries the status_list reference
    const status = credential.payload.status as { status_list: { idx: number; uri: string } }
    expect(status).toEqual({
      status_list: { idx: expect.any(Number), uri: expect.stringMatching(/\/token-status-lists\/[^/]+$/) },
    })
    const listId = status.status_list.uri.split('/').pop() as string

    // the public token: statuslist+jwt, signed by the credential's issuer key, entry valid
    const before = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(before.headers['content-type']).toMatch(/application\/statuslist\+jwt/)
    const { header, payload } = decodeJwt(before.text)
    expect(header).toMatchObject({ typ: 'statuslist+jwt', alg: 'EdDSA', kid: expect.stringContaining(issuerDid) })
    expect(payload).toMatchObject({ iss: issuerDid, sub: status.status_list.uri, ttl: 300, status_list: { bits: 1 } })
    expect(getListFromStatusListJWT(before.text).getStatus(status.status_list.idx)).toBe(TokenStatus.Valid)

    // a Credo verifier fetches the list and accepts the credential
    const verified = await agent.sdJwtVc.verify({ compactSdJwtVc: credential.compact })
    expect(verified.isValid).toBe(true)

    // revoke → the entry flips, the token is re-signed, verification now fails on status
    await request(app)
      .post(`/openid4vc/issuance-session/${sessionId}/revoke`)
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .expect(200)

    const after = await request(app).get(`/token-status-lists/${listId}`).expect(200)
    expect(after.text).not.toBe(before.text)
    expect(getListFromStatusListJWT(after.text).getStatus(status.status_list.idx)).toBe(TokenStatus.Invalid)

    const reverified = await agent.sdJwtVc.verify({ compactSdJwtVc: credential.compact })
    expect(reverified.isValid).toBe(false)

    // only the JWT format exists for now
    await request(app).get(`/token-status-lists/${listId}`).set('Accept', 'application/statuslist+cwt').expect(406)
    await request(app).get('/token-status-lists/unknown').expect(404)
  })
})
