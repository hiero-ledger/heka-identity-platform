import { Server } from 'net'

import { Agent, DidKey, KeyDidCreateOptions } from '@credo-ts/core'
import { KnownJwaSignatureAlgorithms } from '@credo-ts/core/build/modules/kms'
import { SchemaGenerator } from '@mikro-orm/sqlite'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { DidKeyRegistrar } from 'common/did-registrar/methods'
import { Role } from 'src/common/auth'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'
import { createAgent, TestAgentModulesMap } from './helpers/test-agent'

describe('E2E issuance session', () => {
  let ormSchemaGenerator: SchemaGenerator

  let nestApp: INestApplication
  let app: Server
  let issuerDidKey: DidKey
  let agent: Agent<TestAgentModulesMap>

  beforeAll(async () => {
    const orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.getSchemaGenerator()

    await ormSchemaGenerator.refreshDatabase()

    agent = createAgent()
    await agent.initialize()

    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    // TODO: Find a way to explicitly await the required condition
    // Give AFJ event listeners some time to process pending events
    await sleep(2000)

    await nestApp.close()

    await ormSchemaGenerator.clearDatabase()
  })

  async function testCredentialIssuance(didMethod: string, expectedAlg: string) {
    const issuerAccountId = uuid()
    const issuerAccountAuthToken = await createAuthToken(issuerAccountId, Role.Admin)

    const postDidResponse = await request(app).post('/dids').auth(issuerAccountAuthToken, { type: 'bearer' }).send({
      method: didMethod,
    })
    expect(postDidResponse.statusCode).toBe(201)

    const issuerId = postDidResponse.body.id
    issuerDidKey = DidKey.fromDid(issuerId as string)

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
                  KnownJwaSignatureAlgorithms.EdDSA,
                  KnownJwaSignatureAlgorithms.ES256,
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
              did: issuerDidKey.did,
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
          credentials: ['SdJwtVcExample'],
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
                did: issuerDidKey.did,
                didUrl: `${issuerDidKey.did}#${issuerDidKey.publicJwk.fingerprint}`,
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

    const resolvedOffer = await agent.modules.openId4VcHolder.resolveCredentialOffer(response.body.credentialOffer)
    const tokenResponse = await agent.modules.openId4VcHolder.requestToken({ resolvedCredentialOffer: resolvedOffer })
    const requestCredentialsResult = await agent.modules.openId4VcHolder.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      credentialBindingResolver: () => ({
        method: 'did',
        didUrls: [`${holderVerifiedDid}`],
      }),
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
    })

    expect(requestCredentialsResult.credentials).toHaveLength(1)

    const { credentials } = requestCredentialsResult.credentials[0]

    expect(credentials).toHaveLength(1)
    expect(credentials).toEqual([
      {
        claimFormat: 'vc+sd-jwt',
        encoded: expect.any(String),
        compact: expect.any(String),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        header: { alg: expectedAlg, kid: `#${issuerDidKey.publicJwk.fingerprint}`, typ: 'vc+sd-jwt' },
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
      },
    ])
  }

  test('create offer with `key` DID method', async () => {
    await testCredentialIssuance('key', 'EdDSA')
  })

  // Need to add Indy-Besu network to CI
  test.skip('create offer with `indybesu` DID method', async () => {
    await testCredentialIssuance('indybesu', 'ES256K')
  })
})
