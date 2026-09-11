import { Server } from 'net'

import { Kms, Mdoc, X509Certificate } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import * as x509 from '@peculiar/x509'
import request from 'supertest'

import { Agent, AGENT_TOKEN } from 'src/common/agent'
import { assessEuSigningCertificate, ID_ETSI_QCT_PID_OID, MdocIssuerCaService } from 'src/mdoc-issuer-ca'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'

const PID_DOCTYPE = 'eu.europa.ec.eudi.pid.1'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
/** supertest does not buffer unknown media types — collect the DER body as a Buffer. */
const binaryParser = (res: unknown, callback: (error: Error | null, body: Buffer) => void): void => {
  const stream = res as NodeJS.ReadableStream
  const chunks: Buffer[] = []
  stream.on('data', (chunk: Buffer) => chunks.push(chunk))
  stream.on('end', () => callback(null, Buffer.concat(chunks)))
}

const POLICY_OID = '0.4.0.2042.1.3' // EN 319 411-1 LCP — a real policy identifier, used here as the operator's choice

/**
 * E1.1 over the real stack (the "real-Askar" test deferred at E1): with the EUDI PID profile, a tenant's
 * IACA + DSC are minted through the tenant KMS, the DSC meets every ETSI TS 119 412-6 clause 4 requirement
 * (executable checklist), its AIA points at a public route that serves the IACA, the chain validates in
 * Credo, and an mdoc PID signed with that DSC (no ISO mdlDS EKU) verifies in another tenant through the
 * IACA registry.
 */
describe('mdoc issuer CA — EUDI PID certificate profile (TS 119 412-6)', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let app: Server
  const previousEnv = {
    MDOC_ISSUER_PROFILE: process.env.MDOC_ISSUER_PROFILE,
    MDOC_ISSUER_ORGANIZATION_IDENTIFIER: process.env.MDOC_ISSUER_ORGANIZATION_IDENTIFIER,
    MDOC_ISSUER_CERTIFICATE_POLICY_OID: process.env.MDOC_ISSUER_CERTIFICATE_POLICY_OID,
    MDOC_ISSUER_COUNTRY: process.env.MDOC_ISSUER_COUNTRY,
    MDOC_DEFAULT_DOCTYPE: process.env.MDOC_DEFAULT_DOCTYPE,
  }

  beforeAll(async () => {
    // read by AgentConfig() when the test app builds
    process.env.MDOC_ISSUER_PROFILE = 'eudi-pid'
    process.env.MDOC_ISSUER_ORGANIZATION_IDENTIFIER = 'VATDE-0123456789'
    process.env.MDOC_ISSUER_CERTIFICATE_POLICY_OID = POLICY_OID
    process.env.MDOC_ISSUER_COUNTRY = 'DE'
    process.env.MDOC_DEFAULT_DOCTYPE = PID_DOCTYPE

    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
    await ormSchemaGenerator.refresh()
    nestApp = await startTestApp()
    app = nestApp.getHttpServer() as Server
  })

  afterAll(async () => {
    await sleep(2000)
    await nestApp.close()
    await ormSchemaGenerator.clear()
    await orm.close(true)
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('the tenant DSC is a conformant PID Provider sign/seal certificate and signs a verifiable PID', async () => {
    const agent = nestApp.get<Agent>(AGENT_TOKEN)
    const mdocIssuerCa = nestApp.get(MdocIssuerCaService)

    // provision under the EU profile inside a tenant (keys in the tenant Askar store)
    const issuerTenant = await agent.modules.tenants.createTenant({ config: { label: 'eu pid issuer' } })
    const issuerAgent = await agent.modules.tenants.getTenantAgent({ tenantId: issuerTenant.id })
    let iacaBase64: string
    let dscBase64: string
    let iacaFingerprint: string
    let mdocBase64Url: string
    try {
      const { iaca, dsc } = await mdocIssuerCa.ensure(issuerAgent.context)
      iacaBase64 = iaca.certificateBase64
      dscBase64 = dsc.certificateBase64
      iacaFingerprint = iaca.fingerprint
      expect(iaca).toMatchObject({
        profile: 'eudi-pid',
        organizationIdentifier: 'VATDE-0123456789',
        certificatePolicyOid: POLICY_OID,
      })

      // sign a PID mdoc with the DSC (loaded with its KMS key bound)
      const signingDsc = await mdocIssuerCa.loadCurrentDsc(issuerAgent.context)
      const holderKey = await issuerAgent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
      const mdoc = await issuerAgent.mdoc.sign({
        docType: PID_DOCTYPE,
        issuerCertificate: signingDsc,
        holderKey: Kms.PublicJwk.fromPublicJwk(holderKey.publicJwk),
        namespaces: { [PID_DOCTYPE]: { given_name: 'Ada', family_name: 'Lovelace' } },
        validityInfo: { validUntil: new Date(Date.now() + ONE_DAY_MS) },
      })
      mdocBase64Url = mdoc.base64Url
    } finally {
      await issuerAgent.endSession()
    }

    // the DSC passes the TS 119 412-6 clause 4 checklist
    const dsc = new x509.X509Certificate(Buffer.from(dscBase64, 'base64'))
    const assessment = assessEuSigningCertificate(dsc, { requiredQcType: ID_ETSI_QCT_PID_OID })
    expect(assessment.violations).toEqual([])
    expect(assessment.met).toBe(true)
    expect(dsc.subject).toContain('2.5.4.97=VATDE-0123456789')
    expect(dsc.subject).toContain('CN=Heka PID DSC')
    expect(dsc.getExtension(x509.ExtendedKeyUsageExtension)).toBeNull() // no ISO mdlDS EKU on a PID DSC

    // its AIA caIssuers points at the public IACA download, which serves the IACA DER
    const aia = dsc.getExtension(x509.AuthorityInfoAccessExtension)
    const caIssuers = aia?.caIssuers.map((name) => name.value) ?? []
    expect(caIssuers).toEqual([expect.stringMatching(new RegExp(`/mdoc-issuers/certificates/${iacaFingerprint}$`))])
    const download = await request(app)
      .get(`/mdoc-issuers/certificates/${iacaFingerprint}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
    expect(download.headers['content-type']).toMatch(/application\/pkix-cert/)
    expect((download.body as Buffer).toString('base64')).toBe(iacaBase64)
    await request(app).get('/mdoc-issuers/certificates/0000').expect(404)

    // the IACA is a self-signed CA with the same legal-person DN; the chain validates in Credo
    const iaca = new x509.X509Certificate(Buffer.from(iacaBase64, 'base64'))
    expect(iaca.subject).toBe(iaca.issuer)
    expect(iaca.subject).toContain('2.5.4.97=VATDE-0123456789')
    expect(iaca.getExtension(x509.BasicConstraintsExtension)?.ca).toBe(true)
    const verifierTenant = await agent.modules.tenants.createTenant({ config: { label: 'verifier' } })
    const verifierAgent = await agent.modules.tenants.getTenantAgent({ tenantId: verifierTenant.id })
    try {
      await verifierAgent.x509.validateCertificateChain({
        certificateChain: [dscBase64, iacaBase64],
        trustedCertificates: [iacaBase64],
      })
      expect(X509Certificate.fromEncodedCertificate(dscBase64).extendedKeyUsage).toEqual([])

      // the PID mdoc signed by the EU-profile DSC verifies through the IACA registry (no EKU needed)
      const result = await Mdoc.fromBase64Url(mdocBase64Url).verify(verifierAgent.context)
      expect(result.isValid, result.isValid ? undefined : result.error).toBe(true)
    } finally {
      await verifierAgent.endSession()
    }
  })
})
