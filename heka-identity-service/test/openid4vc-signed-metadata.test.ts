import { Server } from 'net'
import { webcrypto } from 'node:crypto'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import * as x509 from '@peculiar/x509'
import request from 'supertest'

import { CredentialFormat } from 'openid4vc/issuer/dto/common/credential'
import { Role } from 'src/common/auth'
import AgentConfig from 'src/config/agent'
import { OpenId4VcIssuersCreateDto } from 'src/openid4vc/issuer/dto'
import { uuid } from 'src/utils/misc'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'
import { createAuthToken } from './helpers/jwt'

/**
 * Emission proof: with signed-metadata publishing enabled, the OID4VCI credential-issuer
 * metadata is served as a `signed_metadata` JWT carrying the access cert's `x5c` chain, and its ES256
 * signature verifies against the leaf. Exercises the whole wiring end-to-end through real Credo:
 * AccessCertificateService mint (real X509SignerService) → issuer.service threads `metadataSigner` →
 * Credo mints/serves the JWT at `.well-known/openid-credential-issuer` under `Accept: application/jwt`.
 */
describe('OID4VCI signed_metadata', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>

  let nestApp: INestApplication
  let app: Server
  let previousFlag: string | undefined

  beforeAll(async () => {
    previousFlag = process.env.OID4VCI_SIGNED_METADATA_ENABLED
    process.env.OID4VCI_SIGNED_METADATA_ENABLED = 'true' // read by AgentConfig() when the test app builds
    x509.cryptoProvider.set(webcrypto as unknown as Crypto)

    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  beforeEach(async () => {
    await ormSchemaGenerator.refresh()
    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterEach(async () => {
    await sleep(5000)
    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
    if (previousFlag === undefined) delete process.env.OID4VCI_SIGNED_METADATA_ENABLED
    else process.env.OID4VCI_SIGNED_METADATA_ENABLED = previousFlag
  })

  test('serves a verifiable signed_metadata JWT (x5c) at the issuer .well-known', async () => {
    const publicIssuerId = 'signed-metadata-issuer'
    const adminAuthToken = await createAuthToken(uuid(), Role.Admin)

    const createResponse = await request(app)
      .post(`/openid4vc/issuer/`)
      .auth(adminAuthToken, { type: 'bearer' })
      .send({
        publicIssuerId,
        credentialsSupported: [
          {
            id: 'SdJwtVcExample',
            format: CredentialFormat.SdJwt,
            vct: 'https://example.com/vct',
            claims: { f1: {} },
          },
        ],
      } satisfies OpenId4VcIssuersCreateDto)
    expect(createResponse.statusCode).toBe(200)

    // Resolve the credential-issuer .well-known against the local oid4vc server (pin 127.0.0.1 + the actual
    // listen port so a leaked EXPRESS_HOST / AGENT_OID4VCI_ENDPOINT can't redirect the fetch).
    const agencyConfig = nestApp.get<ConfigType<typeof AgentConfig>>(AgentConfig.KEY)
    const basePath = new URL(agencyConfig.oidConfig.issuanceEndpoint).pathname
    const wellKnownUrl = `http://127.0.0.1:${agencyConfig.oidConfig.port}${basePath}/${publicIssuerId}/.well-known/openid-credential-issuer`

    const metadataResponse = await fetch(wellKnownUrl, { headers: { Accept: 'application/jwt' } })
    expect(metadataResponse.status).toBe(200)
    expect(metadataResponse.headers.get('content-type')).toContain('application/jwt')

    const jwt = (await metadataResponse.text()).trim()
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.')
    expect([encodedHeader, encodedPayload, encodedSignature].every((part) => part && part.length > 0)).toBe(true)

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
    expect(header).toMatchObject({ alg: 'ES256', typ: 'openidvci-issuer-metadata+jwt' })
    expect(Array.isArray(header.x5c) && header.x5c.length >= 1).toBe(true)

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    expect(payload.credential_issuer).toMatch(new RegExp(`/oid4vci/${publicIssuerId}$`))

    // The ES256 signature verifies against the leaf certificate published in the x5c header.
    const leaf = new x509.X509Certificate(Buffer.from(header.x5c[0], 'base64'))
    const publicKey = await leaf.publicKey.export()
    const verified = await (webcrypto as unknown as Crypto).subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Buffer.from(encodedSignature, 'base64url'),
      Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
    )
    expect(verified).toBe(true)
  })
})
