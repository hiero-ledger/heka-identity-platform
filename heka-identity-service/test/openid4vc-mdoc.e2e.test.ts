import { Server } from 'net'

import { Agent, Kms, Mdoc, MdocRecord, TypedArrayEncoder, X509ModuleConfig } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import AgentConfig from 'test/config/agent'

import { initializeMikroOrm, startTestApp, waitUntil } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
const MDL_NAMESPACE = 'org.iso.18013.5.1'

/**
 * Issues an `mso_mdoc` credential through the service over OID4VCI and checks that a holder on the same
 * Credo version can decode and verify it (and rejects it against an untrusted certificate), then presents it
 * back to the service verifier over OID4VP (DCQL) with selective disclosure. Issuer, holder and verifier share
 * one Credo copy, so this covers the service's mdoc mapping and the same-version round trip, not wire-format
 * compatibility between Credo releases.
 */
describe('E2E mso_mdoc issuance and presentation', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server
  let holder: Agent<TestAgentModulesMap>
  let mdlIssuerCertificate: string

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()

    mdlIssuerCertificate = AgentConfig().mdlIssuerCertificate

    holder = createAgent()
    await holder.initialize()
    // The holder verifies the mdoc against its trusted certificates when it receives it.
    holder.dependencyManager.resolve(X509ModuleConfig).addTrustedCertificate(mdlIssuerCertificate)

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await nestApp?.close()
    await holder?.shutdown()

    await ormSchemaGenerator?.clear()
    await orm?.close(true)
  })

  test('issue mso_mdoc over OID4VCI, verify it on the holder and present it over OID4VP DCQL', async () => {
    const authToken = await createAuthToken(uuid(), Role.Admin)

    const postDidResponse = await request(app).post('/dids').auth(authToken, { type: 'bearer' }).send({})
    expect(postDidResponse.statusCode).toBe(201)
    const publicId = postDidResponse.body.id as string

    // Issue
    const issuerResponse = await request(app)
      .post('/openid4vc/issuer')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicIssuerId: publicId,
        credentialsSupported: [{ id: 'mDL', format: OpenId4VciCredentialFormatProfile.MsoMdoc, doctype: MDL_DOCTYPE }],
      })
    expect(issuerResponse.statusCode).toBe(200)

    const offerResponse = await request(app)
      .post('/openid4vc/issuance-session/offer')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicIssuerId: publicId,
        credentials: [
          {
            credentialSupportedId: 'mDL',
            format: OpenId4VciCredentialFormatProfile.MsoMdoc,
            namespaces: {
              [MDL_NAMESPACE]: {
                given_name: 'John',
                family_name: 'Doe',
                // Form input arrives as a string; the service must issue it as a boolean (ISO 18013-5).
                age_over_18: 'true',
              },
            },
          },
        ],
      })
    expect(offerResponse.statusCode).toBe(200)

    const resolvedOffer = await holder.openid4vc.holder.resolveCredentialOffer(offerResponse.body.credentialOffer)
    const tokenResponse = await holder.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const holderKey = await holder.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const holderPublicJwk = Kms.PublicJwk.fromPublicJwk(holderKey.publicJwk)
    const credentialResponse = await holder.openid4vc.holder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      ...tokenResponse,
      credentialBindingResolver: () => ({ method: 'jwk', keys: [holderPublicJwk] }),
    })

    expect(credentialResponse.credentials).toHaveLength(1)
    const record = credentialResponse.credentials[0].record
    expect(record).toBeInstanceOf(MdocRecord)
    const mdocRecord = record as MdocRecord

    // Decode the wire format again from scratch and verify the issuer signature and certificate chain.
    const mdoc = Mdoc.fromBase64Url(mdocRecord.firstCredential.base64Url)
    expect(mdoc.docType).toBe(MDL_DOCTYPE)
    expect(mdoc.issuerSignedNamespaces).toEqual({
      [MDL_NAMESPACE]: { given_name: 'John', family_name: 'Doe', age_over_18: true },
    })
    expect(mdoc.deviceKey.fingerprint).toBe(holderPublicJwk.fingerprint)
    expect(TypedArrayEncoder.toBase64(mdoc.signingCertificate)).toBe(mdlIssuerCertificate)
    expect(mdoc.validityInfo.validUntil.getTime()).toBeGreaterThan(Date.now())

    await expect(holder.mdoc.verify(mdoc, { trustedCertificates: [mdlIssuerCertificate] })).resolves.toEqual({
      isValid: true,
    })

    // The same mdoc must be rejected when only an unrelated certificate is trusted.
    const untrustedKey = await holder.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
    const untrustedCertificate = await holder.x509.createCertificate({
      authorityKey: Kms.PublicJwk.fromPublicJwk(untrustedKey.publicJwk),
      issuer: 'CN=Untrusted mDL issuer',
    })
    await expect(
      holder.mdoc.verify(mdoc, { trustedCertificates: [untrustedCertificate.toString('base64')] }),
    ).resolves.toMatchObject({ isValid: false })

    await holder.mdoc.store({ record: mdocRecord })

    // Present
    const verifierResponse = await request(app)
      .post('/openid4vc/verifier')
      .auth(authToken, { type: 'bearer' })
      .send({ publicVerifierId: publicId })
    expect(verifierResponse.statusCode).toBe(200)

    const presentationRequestResponse = await request(app)
      .post('/openid4vc/verification-session/request')
      .auth(authToken, { type: 'bearer' })
      .send({
        publicVerifierId: publicId,
        requestSigner: { method: 'did', did: postDidResponse.body.authentication[0] },
        dcql: {
          query: {
            credentials: [
              {
                id: 'mdl',
                format: OpenId4VciCredentialFormatProfile.MsoMdoc,
                meta: { doctype_value: MDL_DOCTYPE },
                claims: [{ path: [MDL_NAMESPACE, 'given_name'] }, { path: [MDL_NAMESPACE, 'age_over_18'] }],
              },
            ],
          },
        },
      })
    expect(presentationRequestResponse.statusCode).toBe(200)

    const resolvedRequest = await holder.openid4vc.holder.resolveOpenId4VpAuthorizationRequest(
      presentationRequestResponse.body.authorizationRequest,
    )
    expect(resolvedRequest.dcql?.queryResult.can_be_satisfied).toBe(true)

    const acceptResult = await holder.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
      authorizationRequestPayload: resolvedRequest.authorizationRequestPayload,
      dcql: {
        credentials: holder.openid4vc.holder.selectCredentialsForDcqlRequest(resolvedRequest.dcql!.queryResult),
      },
    })
    expect(acceptResult.serverResponse?.status).toBe(200)

    const sessionId = presentationRequestResponse.body.verificationSession.id as string
    let sessionResponse!: request.Response
    await waitUntil(
      async () => {
        sessionResponse = await request(app)
          .get(`/openid4vc/verification-session/${sessionId}`)
          .auth(authToken, { type: 'bearer' })
        return sessionResponse.statusCode === 200 && sessionResponse.body.state === 'ResponseVerified'
      },
      { message: 'Verification session did not reach ResponseVerified' },
    )

    // Only the requested elements are disclosed.
    expect(sessionResponse.body.sharedAttributes).toEqual({ given_name: 'John', age_over_18: true })
  })
})
