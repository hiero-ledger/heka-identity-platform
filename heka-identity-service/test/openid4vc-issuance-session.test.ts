import { Server } from 'net'

import { Agent, KeyDidCreateOptions, Kms, SdJwtVcRecord } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { DidKeyRegistrar } from 'common/did-registrar/methods'
import { Role } from 'src/common/auth'
import { parseDidMethods } from 'src/config/insecure-defaults'
import { uuid } from 'src/utils/misc'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

// Issuer DID methods beyond `key` are tested when enabled in DID_METHODS. `indybesu` needs a local Indy-Besu network
// (see docs/setup.md, "Local Indy-Besu network"); `indy` and `hedera` write to BCovrin Test and Hedera testnet
const didMethods = parseDidMethods(process.env)

describe('E2E issuance session', () => {
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
    await nestApp.close()

    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  /**
   * `addSigningKey`: the DID's own key cannot sign credentials (the did:indy `#verkey` is `authentication` only), so a
   * key with the default purposes (`assertionMethod`, `authentication`) is added first and the service signs with it.
   */
  async function testCredentialIssuance(didMethod: string, expectedAlg: string, { addSigningKey = false } = {}) {
    const issuerAccountId = uuid()
    const issuerAccountAuthToken = await createAuthToken(issuerAccountId, Role.Admin)

    const postDidResponse = await request(app).post('/dids').auth(issuerAccountAuthToken, { type: 'bearer' }).send({
      method: didMethod,
    })
    expect(postDidResponse.statusCode).toBe(201)

    const issuerId = postDidResponse.body.id as string
    // The service signs with the first verification method that is an `assertionMethod`
    let issuerKeyId = postDidResponse.body.verificationMethod[0].id as string
    if (addSigningKey) {
      const updateResponse = await request(app)
        .patch(`/dids/${issuerId}`)
        .auth(issuerAccountAuthToken, { type: 'bearer' })
        .send({ addVerificationMethods: [{ id: '#signing-key' }] })
      expect(updateResponse.statusCode).toBe(200)
      issuerKeyId = `${issuerId}#signing-key`
    }

    const issuerResponse = await request(app)
      .post(`/openid4vc/issuer`)
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerId,
        credentialsSupported: [
          {
            id: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            vct: 'https://example.com/vct',
            proof_types_supported: {
              jwt: {
                proof_signing_alg_values_supported: [
                  Kms.KnownJwaSignatureAlgorithms.EdDSA,
                  Kms.KnownJwaSignatureAlgorithms.ES256,
                ],
              },
            },
          },
        ],
      })

    expect(issuerResponse.statusCode).toBe(200)

    const response = await request(app)
      .post(`/openid4vc/issuance-session/offer`)
      .auth(issuerAccountAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId: issuerId,
        credentials: [
          {
            credentialSupportedId: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            issuer: {
              method: 'did',
              did: issuerId,
            },
            payload: {
              first_name: 'John',
              age: {
                over_21: true,
                over_18: true,
                over_65: false,
              },
            },
            disclosureFrame: {
              _sd: ['age.over_21', 'age.over_18', 'age.over_65'],
            },
          },
        ],
      })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      issuanceSession: {
        createdAt: expect.any(String),
        credentialOfferPayload: {
          credential_configuration_ids: ['SdJwtVcExample'],
          credential_issuer: expect.stringMatching(new RegExp(`/oid4vci/${issuerId}$`)),
          grants: {
            'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
              'pre-authorized_code': expect.any(String),
            },
          },
        },
        id: expect.any(String),
        publicIssuerId: expect.any(String),
        preAuthorizedCode: expect.any(String),
        state: 'OfferCreated',
        type: 'OpenId4VcIssuanceSessionRecord',
        updatedAt: expect.any(String),
        credentialOfferUri: expect.stringMatching(new RegExp(`/oid4vci/${issuerId}/offers/`)),
        issuanceMetadata: {
          credentials: [
            {
              credentialSupportedId: 'SdJwtVcExample',
              format: 'vc+sd-jwt',
              issuer: {
                did: issuerId,
                didUrl: issuerKeyId,
                method: 'did',
              },
              payload: {
                first_name: 'John',
                age: {
                  over_21: true,
                  over_18: true,
                  over_65: false,
                },
              },
              type: 'https://example.com/vct',
              disclosureFrame: {
                _sd: ['age.over_21', 'age.over_18', 'age.over_65'],
              },
            },
          ],
        },
      },
      credentialOffer: expect.stringMatching(
        new RegExp(
          `^openid-credential-offer://\\?credential_offer_uri=` +
            `http[^/]+` +
            encodeURIComponent(`/oid4vci/${issuerId}/offers/`).replace(/\./g, '\\.') +
            `[^/]+$`,
        ),
      ),
    })

    // const credentialIssued = firstValueFrom(
    //   agent.events
    //     .observable<OpenId4VcIssuanceSessionStateChangedEvent>(OpenId4VcIssuerEvents.IssuanceSessionStateChanged)
    //     .pipe(
    //       filter(
    //         (event) =>
    //           event.payload.issuanceSession.state === OpenId4VcIssuanceSessionState.CredentialIssued &&
    //           event.payload.issuanceSession.id === response.body.issuanceSession.id,
    //       ),
    //       first(),
    //       timeout(10000),
    //     ),
    // )

    const holderKey = await agent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })
    const holderDidDocumentResult = await agent.dids.create<KeyDidCreateOptions>({
      method: DidKeyRegistrar.method,
      options: {
        keyId: holderKey.keyId,
      },
    })
    if (holderDidDocumentResult.didState.state !== 'finished' || !holderDidDocumentResult.didState.didDocument) {
      throw new Error('The holder DidDocument didn not created')
    }

    const holderDidDocument = holderDidDocumentResult.didState.didDocument
    const holderVerifiedDid = holderDidDocument.verificationMethod![0].id

    const resolvedOffer = await agent.openid4vc.holder.resolveCredentialOffer(response.body.credentialOffer)
    const tokenResponse = await agent.openid4vc.holder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const requestCredentialsResult = await agent.openid4vc.holder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      credentialBindingResolver: () => ({
        method: 'did',
        didUrls: [`${holderVerifiedDid}`],
      }),
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
    })

    expect(requestCredentialsResult.credentials).toHaveLength(1)

    const credential = (requestCredentialsResult.credentials[0].record as SdJwtVcRecord).firstCredential

    expect(credential).toMatchObject({
      claimFormat: 'dc+sd-jwt',
      encoded: expect.any(String),
      compact: expect.any(String),

      header: { alg: expectedAlg, kid: `#${issuerKeyId.split('#')[1]}`, typ: 'vc+sd-jwt' },
      payload: {
        _sd_alg: 'sha-256',
        age: {
          over_18: true,
          over_21: true,
          over_65: false,
        },
        cnf: {
          kid: `${holderVerifiedDid}`,
        },
        first_name: 'John',
        iat: expect.any(Number),
        iss: issuerId,
        vct: 'https://example.com/vct',
      },
      prettyClaims: {
        age: {
          over_18: true,
          over_21: true,
          over_65: false,
        },
        cnf: {
          kid: `${holderVerifiedDid}`,
        },
        first_name: 'John',
        iat: expect.any(Number),
        iss: issuerId,
        vct: 'https://example.com/vct',
      },
    })
  }

  test('an offer for a DID without an OpenID4VC issuer is 404', async () => {
    const token = await createAuthToken(uuid(), Role.Admin)
    // The issuer is looked up first, so the DID does not need to exist
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

    const response = await request(app)
      .post('/openid4vc/issuance-session/offer')
      .auth(token, { type: 'bearer' })
      .send({
        publicIssuerId: did,
        credentials: [
          {
            credentialSupportedId: 'SdJwtVcExample',
            format: 'vc+sd-jwt',
            issuer: { method: 'did', did },
            payload: { first_name: 'John' },
          },
        ],
      })

    expect(response.statusCode).toBe(404)
    expect(response.body.message).toContain('OpenId4VcIssuerRecord')
  })

  test('create offer with `key` DID method', async () => {
    await testCredentialIssuance('key', 'EdDSA')
  })

  test.skipIf(!didMethods.includes('indy'))('create offer with `indy` DID method', async () => {
    await testCredentialIssuance('indy', 'EdDSA', { addSigningKey: true })
  })

  test.skipIf(!didMethods.includes('hedera'))('create offer with `hedera` DID method', async () => {
    await testCredentialIssuance('hedera', 'EdDSA')
  })

  test.skipIf(!didMethods.includes('indybesu'))('create offer with `indybesu` DID method', async () => {
    await testCredentialIssuance('indybesu', 'ES256K')
  })
})
