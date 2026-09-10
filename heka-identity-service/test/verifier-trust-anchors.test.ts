import { Server } from 'net'

import { Kms, Mdoc } from '@credo-ts/core'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'

import { Agent, AGENT_TOKEN } from 'src/common/agent'
import { MdocIssuerCaService } from 'src/mdoc-issuer-ca'
import { sleep } from 'src/utils/timers'

import { initializeMikroOrm, startTestApp } from './helpers'

const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * The service as Relying Party trusts its own tenants' issuers through the IACA registry (E6.1):
 * an mdoc signed by one tenant's DSC verifies in another tenant's context with NO static
 * `MDL_ISSUER_CERTIFICATE` — the trusted certificates come from `VerifierTrustAnchorService` via Credo's
 * `getTrustedCertificatesForVerification` hook. With the registry source disabled the same mdoc is
 * untrusted, proving the hook (not a static list) is what grants the trust.
 */
describe('Verifier trust anchors (service as Relying Party)', () => {
  let ormSchemaGenerator: SchemaGenerator
  let orm: MikroORM<PostgreSqlDriver>
  let nestApp: INestApplication
  let previousSources: string | undefined
  let previousMdlCertificate: string | undefined

  beforeAll(async () => {
    previousSources = process.env.VERIFIER_TRUST_SOURCES
    previousMdlCertificate = process.env.MDL_ISSUER_CERTIFICATE
    delete process.env.MDL_ISSUER_CERTIFICATE
    orm = await initializeMikroOrm()
    ormSchemaGenerator = orm.schema
  })

  afterEach(async () => {
    await sleep(5000)
    await nestApp.close()
  })

  afterAll(async () => {
    await ormSchemaGenerator.clear()
    await orm.close(true)
    if (previousSources === undefined) delete process.env.VERIFIER_TRUST_SOURCES
    else process.env.VERIFIER_TRUST_SOURCES = previousSources
    if (previousMdlCertificate !== undefined) process.env.MDL_ISSUER_CERTIFICATE = previousMdlCertificate
  })

  const startApp = async (verifierTrustSources: string): Promise<{ agent: Agent; app: Server }> => {
    process.env.VERIFIER_TRUST_SOURCES = verifierTrustSources // read by AgentConfig() when the test app builds
    await ormSchemaGenerator.refresh()
    nestApp = await startTestApp()
    return { agent: nestApp.get<Agent>(AGENT_TOKEN), app: nestApp.getHttpServer() as Server }
  }

  /** Provision an issuer tenant (IACA + DSC) and sign one mdoc with its current DSC. */
  const signMdocAsNewTenant = async (agent: Agent): Promise<string> => {
    const tenant = await agent.modules.tenants.createTenant({ config: { label: 'mdoc issuer tenant' } })
    const tenantAgent = await agent.modules.tenants.getTenantAgent({ tenantId: tenant.id })
    try {
      const mdocIssuerCa = nestApp.get(MdocIssuerCaService)
      await mdocIssuerCa.ensure(tenantAgent.context)
      const dsc = await mdocIssuerCa.loadCurrentDsc(tenantAgent.context)
      const holderKey = await tenantAgent.kms.createKey({ type: { kty: 'EC', crv: 'P-256' } })
      const mdoc = await tenantAgent.mdoc.sign({
        docType: MDL_DOCTYPE,
        issuerCertificate: dsc,
        holderKey: Kms.PublicJwk.fromPublicJwk(holderKey.publicJwk),
        namespaces: { 'org.iso.18013.5.1': { given_name: 'Ada', family_name: 'Lovelace' } },
        validityInfo: { validUntil: new Date(Date.now() + ONE_DAY_MS) },
      })
      return mdoc.base64Url
    } finally {
      await tenantAgent.endSession()
    }
  }

  /** Verify the mdoc in an unrelated tenant's context, letting Credo ask the X.509 hook for trust. */
  const verifyAsOtherTenant = async (agent: Agent, mdocBase64Url: string) => {
    const tenant = await agent.modules.tenants.createTenant({ config: { label: 'verifier tenant' } })
    const tenantAgent = await agent.modules.tenants.getTenantAgent({ tenantId: tenant.id })
    try {
      return await Mdoc.fromBase64Url(mdocBase64Url).verify(tenantAgent.context)
    } finally {
      await tenantAgent.endSession()
    }
  }

  test('an mdoc signed by a tenant DSC is trusted through the IACA registry, without MDL_ISSUER_CERTIFICATE', async () => {
    const { agent } = await startApp('registry,config')
    const mdocBase64Url = await signMdocAsNewTenant(agent)

    const result = await verifyAsOtherTenant(agent, mdocBase64Url)

    expect(result.isValid, result.isValid ? undefined : result.error).toBe(true)
  })

  test('with the registry source disabled the same mdoc is untrusted', async () => {
    const { agent } = await startApp('config')
    const mdocBase64Url = await signMdocAsNewTenant(agent)

    const result = await verifyAsOtherTenant(agent, mdocBase64Url)

    expect(result.isValid).toBe(false)
  })
})
