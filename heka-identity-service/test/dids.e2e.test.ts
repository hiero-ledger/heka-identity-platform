import { Server } from 'net'

import { HederaLedgerService } from '@credo-ts/hedera'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { JsonRpcProvider } from 'ethers'
import request from 'supertest'

import { DID_PATTERN } from 'src/__tests__/constants'
import { Agent, AGENT_TOKEN } from 'src/common/agent'
import { Role } from 'src/common/auth'
import { Wallet } from 'src/common/entities'
import { uuid } from 'src/utils/misc'

import { initializeMikroOrm, SchemaUtilities, startTestApp } from './helpers'
import { DidUtilities } from './helpers/did'
import { createAuthToken } from './helpers/jwt'

const indyBesuE2E = process.env.INDY_BESU_E2E === 'true'
// IndyDidRegistry contract of the Indy-Besu network
const INDY_DID_REGISTRY = '0x0000000000000000000000000000000000003333'
const INDY_BESU_DID_PATTERN = '^did:indybesu:testnet:0x[0-9a-fA-F]{40}$'

describe('E2E public DIDs creation', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server

  beforeAll(async () => {
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refresh()

    nestApp = await startTestApp({ roleModelEnabled: true })
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
  })

  const postDid = (token: string, method?: string) =>
    request(app)
      .post('/dids')
      .send(method ? { method } : {})
      .auth(token, { type: 'bearer' })

  test('only one main-method (key) DID per wallet; other methods are not limited', async () => {
    const firstAdminToken = await createAuthToken(uuid(), Role.Admin)
    const secondAdminToken = await createAuthToken(uuid(), Role.Admin)

    expect((await postDid(firstAdminToken)).status).toBe(201)
    // Every Admin acts in the shared Administration wallet, which already has its main DID
    expect((await postDid(secondAdminToken)).status).toBe(409)
    expect((await postDid(secondAdminToken, 'indy')).status).toBe(201)
  })

  test('roles other than Admin, OrgAdmin, Issuer and Verifier cannot create a DID', async () => {
    const orgId = uuid()
    for (const token of [
      await createAuthToken(uuid(), Role.OrgManager, orgId),
      await createAuthToken(uuid(), Role.OrgMember, orgId),
      await createAuthToken(uuid(), Role.User),
    ]) {
      expect((await postDid(token)).status).toBe(403)
    }
  })

  test('a Verifier can create only a did:key', async () => {
    const verifierToken = await createAuthToken(uuid(), Role.Verifier, uuid())

    expect((await postDid(verifierToken, 'hedera')).status).toBe(403)
    expect((await postDid(verifierToken, 'indy')).status).toBe(403)
    expect((await postDid(verifierToken)).status).toBe(201)
  })

  test('a did:key cannot have another controller, so it does not wait for the controller wallet', async () => {
    const orgAdminToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())

    expect((await postDid(orgAdminToken)).status).toBe(201)
  })

  test('a did:hedera is controlled by the hedera DID of its controller wallet (Admin -> OrgAdmin -> Issuer)', async () => {
    const orgId = uuid()
    const adminToken = await createAuthToken(uuid(), Role.Admin)
    const orgAdminToken = await createAuthToken(uuid(), Role.OrgAdmin, orgId)
    const issuerToken = await createAuthToken(uuid(), Role.Issuer, orgId)

    const resolveController = async (token: string, did: string) => {
      const response = await request(app).get(`/dids/${did}`).auth(token, { type: 'bearer' })
      expect(response.status).toBe(200)
      return response.body.controller as string | string[] | undefined
    }

    // The controller must have a DID of the same method first
    expect((await postDid(orgAdminToken, 'hedera')).status).toBe(422)
    expect((await postDid(issuerToken, 'hedera')).status).toBe(422)

    const adminResponse = await postDid(adminToken, 'hedera')
    expect(adminResponse.status).toBe(201)
    const adminDid = adminResponse.body.id as string
    expect((await postDid(issuerToken, 'hedera')).status).toBe(422)

    const orgAdminResponse = await postDid(orgAdminToken, 'hedera')
    expect(orgAdminResponse.status).toBe(201)
    const orgAdminDid = orgAdminResponse.body.id as string
    expect(orgAdminResponse.body.controller).toEqual(adminDid)
    // The controller is recorded on the ledger, not only in the local DID record
    expect(await resolveController(issuerToken, orgAdminDid)).toEqual(adminDid)
    // The organization still signs with its own DID: it registers an AnonCreds schema on the ledger
    const schemaResponse = await request(app)
      .post('/schemas')
      .auth(orgAdminToken, { type: 'bearer' })
      .send({ issuerId: orgAdminDid, name: 'Diploma', version: '1.0', attrNames: ['name'] })
    expect(schemaResponse.status).toBe(201)

    const issuerResponse = await postDid(issuerToken, 'hedera')
    expect(issuerResponse.status).toBe(201)
    expect(issuerResponse.body.controller).toEqual(orgAdminDid)
    expect(await resolveController(issuerToken, issuerResponse.body.id as string)).toEqual(orgAdminDid)
  })

  async function testDidCreation(testCase: { method: string; expected: string }) {
    const firstAdminId = uuid()
    const firstAdminAuthToken = await createAuthToken(firstAdminId, Role.Admin)

    const postDidResponse = await request(app)
      .post('/dids')
      .send({ method: testCase.method })
      .auth(firstAdminAuthToken, { type: 'bearer' })

    expect(postDidResponse.status).toBe(201)
    expect(postDidResponse.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(testCase.expected),
      }),
    )
    return postDidResponse.body.id as string
  }

  test('did:key create', async () => {
    await testDidCreation({
      method: 'key',
      expected: `^did:key:`,
    })
  })

  test('did:indy create', async () => {
    await testDidCreation({
      method: 'indy',
      expected: `^did:indy:bcovrin:test:${DID_PATTERN}`,
    })
  })

  test('did:hedera create', async () => {
    await testDidCreation({
      method: 'hedera',
      expected: `^did:hedera:`,
    })
  })

  // Needs a local Indy-Besu network: INDY_BESU_E2E=true (see docs/setup.md, "Local Indy-Besu network")
  test.skipIf(!indyBesuE2E)('did:indybesu create', async () => {
    const did = await testDidCreation({
      method: 'indybesu',
      expected: INDY_BESU_DID_PATTERN,
    })

    // Resolved from the ledger: the DID's own secp256k1 key comes first
    const adminToken = await createAuthToken(uuid(), Role.Admin)
    const response = await request(app).get(`/dids/${did}`).auth(adminToken, { type: 'bearer' })
    expect(response.status).toBe(200)
    expect(response.body.verificationMethod[0]).toEqual(
      expect.objectContaining({ id: `${did}#KEY-1`, type: 'EcdsaSecp256k1VerificationKey2019' }),
    )
  })

  describe('update and deactivation', () => {
    const ADMINISTRATION = 'Administration'

    /** The DID as its ledger has it, resolved by the root agent: no wallet record, no cache. */
    const resolveFromLedger = async (did: string) =>
      await nestApp.get<string, Agent>(AGENT_TOKEN).dids.resolve(did, { useCache: false })

    /** The key mappings of the DID's record in the Administration wallet. */
    const recordKeys = async (did: string) => {
      const { tenantId } = await orm.em.fork().findOneOrFail(Wallet, { id: ADMINISTRATION })
      return await nestApp
        .get<string, Agent>(AGENT_TOKEN)
        .modules.tenants.withTenantAgent({ tenantId }, async (tenantAgent) => {
          const [didRecord] = await tenantAgent.dids.getCreatedDids({ did })
          return didRecord?.keys ?? []
        })
    }

    /** Whether the Administration wallet's KMS holds the key. */
    const kmsHasKey = async (keyId: string) => {
      const { tenantId } = await orm.em.fork().findOneOrFail(Wallet, { id: ADMINISTRATION })
      return await nestApp
        .get<string, Agent>(AGENT_TOKEN)
        .modules.tenants.withTenantAgent({ tenantId }, (tenantAgent) =>
          tenantAgent.kms.getPublicKey({ keyId }).then(
            () => true,
            () => false,
          ),
        )
    }

    const kmsKeyIdOf = async (did: string, fragment: string) =>
      (await recordKeys(did)).find(({ didDocumentRelativeKeyId }) => didDocumentRelativeKeyId === fragment)!.kmsKeyId

    /** Creates the OID4VC issuer and verifier of a DID, as the wallet preparation does. */
    const createOid4VcRecords = async (token: string, did: string) => {
      const issuer = await request(app)
        .post('/openid4vc/issuer')
        .auth(token, { type: 'bearer' })
        .send({
          publicIssuerId: did,
          credentialsSupported: [{ id: 'SdJwtVcExample', format: 'vc+sd-jwt', vct: 'https://example.com/vct' }],
        })
      expect(issuer.status).toBe(200)
      const verifier = await request(app)
        .post('/openid4vc/verifier')
        .auth(token, { type: 'bearer' })
        .send({ publicVerifierId: did })
      expect(verifier.status).toBe(200)
    }

    /** AC27: no new OID4VC issuance offer or verification request is signed with a deactivated DID. */
    const expectOid4VcSessionsRejected = async (token: string, did: string) => {
      const offer = await request(app)
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
      expect(offer.status).toBe(422)
      expect(offer.body.message).toContain('DID is deactivated')

      const verificationRequest = await request(app)
        .post('/openid4vc/verification-session/request')
        .auth(token, { type: 'bearer' })
        .send({
          publicVerifierId: did,
          requestSigner: { method: 'did', did },
          presentationExchange: {
            definition: {
              id: '73797b0c-dae6-46a7-9700-7850855fee22',
              input_descriptors: [
                {
                  id: '64125742-8b6c-422e-82cd-1beb5123ee8f',
                  constraints: { fields: [{ path: ['$.vct'], filter: { type: 'string' } }] },
                },
              ],
            },
          },
        })
      expect(verificationRequest.status).toBe(422)
      expect(verificationRequest.body.message).toContain('DID is deactivated')
    }

    /** AC9, AC23: a deactivated DID is only listed on request, marked, and resolves marked. */
    const expectListedOnlyOnRequest = async (token: string, did: string, method: string) => {
      const listed = await request(app).get('/dids').query({ own: true, method }).auth(token, { type: 'bearer' })
      expect(listed.status).toBe(200)
      expect((listed.body as Array<{ id: string }>).map(({ id }) => id)).not.toContain(did)

      const all = await request(app)
        .get('/dids')
        .query({ own: true, method, includeDeactivated: true })
        .auth(token, { type: 'bearer' })
      expect(all.body).toContainEqual(expect.objectContaining({ id: did, deactivated: true }))

      expect((await DidUtilities.get(app, token, did)).deactivated).toBe(true)
    }

    const addService = {
      addServices: [{ id: '#svc-1', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
    }

    test('did:key and did:indy DIDs are not changed (422), the Indy endorser DID never (403)', async () => {
      const adminToken = await createAuthToken(uuid(), Role.Admin)
      const keyDid = (await postDid(adminToken)).body.id as string
      const indyResponse = await postDid(adminToken, 'indy')
      expect(indyResponse.status).toBe(201)
      const indyDid = indyResponse.body.id as string

      for (const [did, reason] of [
        [keyDid, 'did:key DIDs are immutable'],
        [indyDid, 'did:indy update and deactivation are not implemented yet'],
      ]) {
        const updated = await DidUtilities.update(app, adminToken, did, addService)
        expect(updated.status).toBe(422)
        expect(updated.body.message).toContain(reason)
        const deactivated = await DidUtilities.deactivate(app, adminToken, did)
        expect(deactivated.status).toBe(422)
        expect(deactivated.body.message).toContain(reason)
      }

      // The endorser DID is imported into every wallet that creates a did:indy
      const endorserDid = nestApp.get<string, Agent>(AGENT_TOKEN).agencyConfig.indyEndorserDid
      expect((await DidUtilities.update(app, adminToken, endorserDid, addService)).status).toBe(403)
      expect((await DidUtilities.deactivate(app, adminToken, endorserDid)).status).toBe(403)
    })

    test("a DID that is not the wallet's own is not found (404)", async () => {
      const adminToken = await createAuthToken(uuid(), Role.Admin)
      const orgAdminToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
      const othersDid = (await postDid(adminToken)).body.id as string
      const externalDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

      for (const did of [othersDid, externalDid]) {
        expect((await DidUtilities.update(app, orgAdminToken, did, addService)).status).toBe(404)
        expect((await DidUtilities.deactivate(app, orgAdminToken, did)).status).toBe(404)
      }
    })

    test('only Admin, OrgAdmin and Issuer may change DIDs (403 for other roles)', async () => {
      const orgId = uuid()
      const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
      for (const token of [
        await createAuthToken(uuid(), Role.OrgManager, orgId),
        await createAuthToken(uuid(), Role.OrgMember, orgId),
        await createAuthToken(uuid(), Role.Verifier, orgId),
        await createAuthToken(uuid(), Role.User),
      ]) {
        expect((await DidUtilities.update(app, token, did, addService)).status).toBe(403)
        expect((await DidUtilities.deactivate(app, token, did)).status).toBe(403)
      }
      // The role check comes first; an Issuer gets to the wallet lookup
      const issuerToken = await createAuthToken(uuid(), Role.Issuer, orgId)
      expect((await DidUtilities.update(app, issuerToken, did, addService)).status).toBe(404)
    })

    test('did:hedera: services and keys are added and removed, then the DID is deactivated, once', async () => {
      const adminToken = await createAuthToken(uuid(), Role.Admin)
      const created = await postDid(adminToken, 'hedera')
      expect(created.status).toBe(201)
      const did = created.body.id as string

      // AC1, AC2: one service and two new keys, the first referenced from assertionMethod
      const added = await DidUtilities.update(app, adminToken, did, {
        addServices: [{ id: '#svc-1', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
        addVerificationMethods: [
          { id: '#key-1', purposes: ['assertionMethod'] },
          { id: '#key-2', purposes: [] },
        ],
      })
      expect(added.status).toBe(200)
      for (const document of [added.body, (await resolveFromLedger(did)).didDocument]) {
        expect(document.service).toEqual([
          expect.objectContaining({
            id: `${did}#svc-1`,
            type: 'LinkedDomains',
            serviceEndpoint: 'https://example.com',
          }),
        ])
        expect(document.verificationMethod[0].id).toBe(`${did}#did-root-key`)
        expect(document.verificationMethod).toContainEqual(
          expect.objectContaining({
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            publicKeyMultibase: expect.any(String),
          }),
        )
        expect(document.assertionMethod).toContain(`${did}#key-1`)
      }
      expect((await DidUtilities.get(app, adminToken, did)).service).toEqual(added.body.service)
      expect(await recordKeys(did)).toContainEqual(
        expect.objectContaining({ didDocumentRelativeKeyId: '#key-1', kmsKeyId: expect.any(String) }),
      )

      // AC4, AC5: rejected before anything is written
      for (const body of [
        { removeVerificationMethods: ['#did-root-key'] },
        { addVerificationMethods: [{ id: '#did-root-key' }] },
      ]) {
        expect((await DidUtilities.update(app, adminToken, did, body)).status).toBe(422)
      }
      for (const body of [
        {},
        { removeServices: Array(11).fill('#svc-1') },
        { removeServices: [`${did}#svc-1`] },
        { addServices: [{ id: '#svc-2', type: 'LinkedDomains', serviceEndpoint: 'not a url' }] },
        { addVerificationMethods: [{ purposes: ['keyAgreement'] }] },
        { addVerificationMethods: [{ id: '#key-2', publicKeyMultibase: 'z6Mk' }] },
        { addVerificationMethods: [{ id: '#key-2' }], privateKey: 'secret' },
      ]) {
        expect((await DidUtilities.update(app, adminToken, did, body)).status).toBe(400)
      }

      // A key referenced from a relationship cannot be removed on Hedera: the SDK would leave a dangling reference
      expect((await DidUtilities.update(app, adminToken, did, { removeVerificationMethods: ['#key-1'] })).status).toBe(
        422,
      )

      // AC3: a second consecutive update, checked against the ledger state of the first
      const removedKmsKeyId = await kmsKeyIdOf(did, '#key-2')
      const rootKmsKeyId = await kmsKeyIdOf(did, '#did-root-key')
      const removed = await DidUtilities.update(app, adminToken, did, {
        removeServices: ['#svc-1'],
        removeVerificationMethods: ['#key-2'],
      })
      expect(removed.status).toBe(200)
      const afterRemoval = (await resolveFromLedger(did)).didDocument!
      const ids = (entries: Array<string | { id: string }> = []) =>
        entries.map((entry) => (typeof entry === 'string' ? entry : entry.id))
      expect(afterRemoval.service ?? []).toEqual([])
      expect(ids(afterRemoval.verificationMethod)).toEqual([`${did}#did-root-key`, `${did}#key-1`])
      expect(ids(afterRemoval.assertionMethod)).toContain(`${did}#key-1`)
      expect(await recordKeys(did)).not.toContainEqual(expect.objectContaining({ didDocumentRelativeKeyId: '#key-2' }))
      // The private key of the removed verification method is deleted; the root key stays
      expect(await kmsHasKey(removedKmsKeyId)).toBe(false)
      expect(await kmsHasKey(rootKmsKeyId)).toBe(true)

      await createOid4VcRecords(adminToken, did)

      // AC9, AC10: deactivated once; a repeated call writes nothing
      const ledgerDeactivation = vi.spyOn(HederaLedgerService.prototype, 'deactivateDid')
      const deactivated = await DidUtilities.deactivate(app, adminToken, did)
      expect(deactivated.status).toBe(200)
      expect(deactivated.body).toEqual(expect.objectContaining({ id: did, deactivated: true }))
      expect((await resolveFromLedger(did)).didDocumentMetadata.deactivated).toBe(true)
      const again = await DidUtilities.deactivate(app, adminToken, did)
      expect(again.status).toBe(200)
      expect(again.body.deactivated).toBe(true)
      expect(ledgerDeactivation).toHaveBeenCalledTimes(1)
      await expectListedOnlyOnRequest(adminToken, did, 'hedera')
      await expectOid4VcSessionsRejected(adminToken, did)

      // AC14: no new AnonCreds schema for a deactivated issuer (the keys are still there, so the ledger would accept it)
      const schema = await SchemaUtilities.create(app, adminToken)
      const registration = await request(app)
        .post(`/v2/schemas/${schema!.id}/registration`)
        .auth(adminToken, { type: 'bearer' })
        .send({ protocol: 'Aries', credentialFormat: 'anoncreds', network: 'hedera', did })
      expect(registration.status).toBe(422)
      expect(registration.body.message).toContain('DID is deactivated')
      // Neither through the v1 route, which takes the issuer from the body
      const legacySchema = await request(app)
        .post('/schemas')
        .auth(adminToken, { type: 'bearer' })
        .send({ issuerId: did, name: 'Diploma', version: '1.0', attrNames: ['name'] })
      expect(legacySchema.status).toBe(422)
      expect(legacySchema.body.message).toContain('DID is deactivated')

      // AC11
      expect(
        (
          await DidUtilities.update(app, adminToken, did, {
            addServices: [{ id: '#svc-3', type: 'LinkedDomains', serviceEndpoint: 'https://example.com' }],
          })
        ).status,
      ).toBe(409)
    })

    test('a deactivated did:hedera is neither a controller nor reused by the wallet preparation', async () => {
      const adminToken = await createAuthToken(uuid(), Role.Admin)
      const orgAdminToken = await createAuthToken(uuid(), Role.OrgAdmin, uuid())
      const created = await postDid(adminToken, 'hedera')
      expect(created.status).toBe(201)
      const retired = created.body.id as string
      expect((await DidUtilities.deactivate(app, adminToken, retired)).status).toBe(200)

      // AC13: Administration has no active hedera DID to control the organization's one
      const orgDid = await postDid(orgAdminToken, 'hedera')
      expect(orgDid.status).toBe(422)

      // AC12: the preparation creates a new hedera DID instead of reusing the deactivated one
      const prepared = await request(app).post('/prepare-wallet').auth(adminToken, { type: 'bearer' }).send({})
      expect(prepared.status).toBe(201)
      const hedera = (prepared.body.dids as Array<{ method: string; status: string; did?: string }>).find(
        ({ method }) => method === 'hedera',
      )
      expect(hedera).toEqual(expect.objectContaining({ status: 'created', did: expect.stringMatching(/^did:hedera:/) }))
      expect(hedera?.did).not.toBe(retired)
    })

    // Needs a local Indy-Besu network: INDY_BESU_E2E=true (see docs/setup.md, "Local Indy-Besu network")
    test.skipIf(!indyBesuE2E)(
      'did:indybesu: the DID account replaces the document and deactivates it, without the endorser',
      async () => {
        const agencyConfig = nestApp.get<string, Agent>(AGENT_TOKEN).agencyConfig
        const provider = new JsonRpcProvider(agencyConfig.indyBesuNodeAddress)
        const registryTransactions = async (fromBlock: number) => {
          const transactions = []
          for (let number = fromBlock + 1; number <= (await provider.getBlockNumber()); number++) {
            const block = await provider.getBlock(number, true)
            transactions.push(
              ...(block?.prefetchedTransactions ?? []).filter(
                (transaction) => transaction.to?.toLowerCase() === INDY_DID_REGISTRY.toLowerCase(),
              ),
            )
          }
          return transactions
        }

        const adminToken = await createAuthToken(uuid(), Role.Admin)
        const created = await postDid(adminToken, 'indybesu')
        expect(created.status).toBe(201)
        const did = created.body.id as string
        const address = did.split(':').pop()!
        // The DID's account never received any funds: gas is free on the network
        expect(await provider.getBalance(address)).toBe(BigInt(0))
        const ownerKey = (await resolveFromLedger(did)).didDocument!.verificationMethod![0]
        expect(ownerKey.id).toBe(`${did}#KEY-1`)

        // AC20, AC25
        let fromBlock = await provider.getBlockNumber()
        const withService = await DidUtilities.update(app, adminToken, did, addService)
        expect(withService.status).toBe(200)
        let onLedger = (await resolveFromLedger(did)).didDocument!
        expect(onLedger.service).toEqual([
          expect.objectContaining({
            id: `${did}#svc-1`,
            type: 'LinkedDomains',
            serviceEndpoint: 'https://example.com',
          }),
        ])
        expect(onLedger.verificationMethod![0]).toEqual(ownerKey)
        const updateTransactions = await registryTransactions(fromBlock)
        expect(updateTransactions).toHaveLength(1)
        expect(updateTransactions[0].from.toLowerCase()).toBe(address.toLowerCase())

        // AC21: a new Ed25519 key, then its removal with every reference in one transaction
        const withKey = await DidUtilities.update(app, adminToken, did, {
          addVerificationMethods: [{ id: '#key-2', purposes: ['assertionMethod'] }],
        })
        expect(withKey.status).toBe(200)
        onLedger = (await resolveFromLedger(did)).didDocument!
        expect(onLedger.verificationMethod).toEqual([
          ownerKey,
          expect.objectContaining({
            id: `${did}#key-2`,
            type: 'Ed25519VerificationKey2020',
            publicKeyMultibase: expect.stringMatching(/^z6Mk/),
          }),
        ])
        expect(onLedger.assertionMethod).toEqual([`${did}#KEY-1`, `${did}#key-2`])
        expect(await recordKeys(did)).toContainEqual(
          expect.objectContaining({ didDocumentRelativeKeyId: '#key-2', kmsKeyId: expect.any(String) }),
        )

        const removedKmsKeyId = await kmsKeyIdOf(did, '#key-2')
        fromBlock = await provider.getBlockNumber()
        expect(
          (await DidUtilities.update(app, adminToken, did, { removeVerificationMethods: ['#key-2'] })).status,
        ).toBe(200)
        onLedger = (await resolveFromLedger(did)).didDocument!
        expect(onLedger.verificationMethod).toEqual([ownerKey])
        expect(onLedger.assertionMethod).toEqual([`${did}#KEY-1`])
        expect(await registryTransactions(fromBlock)).toHaveLength(1)
        expect(await recordKeys(did)).not.toContainEqual(
          expect.objectContaining({ didDocumentRelativeKeyId: '#key-2' }),
        )
        expect(await kmsHasKey(removedKmsKeyId)).toBe(false)
        expect(await kmsHasKey(await kmsKeyIdOf(did, '#KEY-1'))).toBe(true)

        // AC22: nothing is written
        const { versionId } = (await resolveFromLedger(did)).didDocumentMetadata
        const wrongType = await DidUtilities.update(app, adminToken, did, {
          addServices: [{ id: '#svc-2', type: 'Foo', serviceEndpoint: 'https://example.com' }],
        })
        expect(wrongType.status).toBe(422)
        expect(wrongType.body.message).toContain('LinkedDomains, DIDCommMessaging, CredentialRegistry, OID4VCI, OID4VP')
        for (const body of [
          { removeVerificationMethods: ['#KEY-1'] },
          { removeVerificationMethods: ['#key-1'] },
          { addVerificationMethods: [{ id: '#Key-1' }] },
        ]) {
          expect((await DidUtilities.update(app, adminToken, did, body)).status).toBe(422)
        }
        expect((await resolveFromLedger(did)).didDocumentMetadata.versionId).toBe(versionId)

        await createOid4VcRecords(adminToken, did)

        // AC23, AC25: deactivated by the DID account; a repeated call sends no transaction
        fromBlock = await provider.getBlockNumber()
        const deactivated = await DidUtilities.deactivate(app, adminToken, did)
        expect(deactivated.status).toBe(200)
        expect(deactivated.body).toEqual(expect.objectContaining({ id: did, deactivated: true }))
        const resolution = await resolveFromLedger(did)
        expect(resolution.didDocumentMetadata.deactivated).toBe(true)
        // The ledger keeps the document of a deactivated DID
        expect(resolution.didDocument!.verificationMethod).toEqual([ownerKey])
        const deactivationTransactions = await registryTransactions(fromBlock)
        expect(deactivationTransactions).toHaveLength(1)
        expect(deactivationTransactions[0].from.toLowerCase()).toBe(address.toLowerCase())

        fromBlock = await provider.getBlockNumber()
        const again = await DidUtilities.deactivate(app, adminToken, did)
        expect(again.status).toBe(200)
        expect(again.body.deactivated).toBe(true)
        expect(await registryTransactions(fromBlock)).toHaveLength(0)
        await expectListedOnlyOnRequest(adminToken, did, 'indybesu')
        // AC27: the deactivated document keeps its keys, still nothing new is signed with it
        await expectOid4VcSessionsRejected(adminToken, did)

        // AC24
        expect((await DidUtilities.update(app, adminToken, did, addService)).status).toBe(409)
      },
    )
  })
})
