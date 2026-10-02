import { Server } from 'net'

import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver, SchemaGenerator } from '@mikro-orm/postgresql'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { Agent, AGENT_TOKEN } from 'src/common/agent'
import { EU_LOTE_SERVICE_TYPE, HEKA_LOTE, MdocIssuerCaService } from 'src/mdoc-issuer-ca'
import { sleep } from 'src/utils/timers'
import { X509SignerService } from 'src/x509-signing'

import { initializeMikroOrm, startTestApp } from './helpers'

type Service = {
  ServiceInformation: {
    ServiceTypeIdentifier?: string
    ServiceDigitalIdentity?: { X509Certificates?: { val: string }[] }
    ServiceInformationExtensions?: Record<string, unknown>[]
  }
}
const decodePayload = (jws: string) =>
  JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8')) as {
    LoTE: {
      ListAndSchemeInformation: Record<string, unknown>
      TrustedEntitiesList: { TrustedEntityServices: Service[] }[]
    }
  }

/**
 * The scheme trust lists over the real stack: a provisioned tenant IACA shows up in
 * `/trust-list/eaa-providers` as an EU `EAA/Issuance` service tagged `origin: tenant`, the service root
 * shows up in `/trust-list/wrpac-providers` as the access-certificate authority, and the index announces
 * both. Nothing from any upstream list is in either.
 */
describe('Scheme trust lists', () => {
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
  })

  test('publishes tenant issuer anchors and the service root as EU-typed scheme lists', async () => {
    const agent = nestApp.get<Agent>(AGENT_TOKEN)
    const tenant = await agent.modules.tenants.createTenant({ config: { label: 'issuer tenant' } })
    const tenantAgent = await agent.modules.tenants.getTenantAgent({ tenantId: tenant.id })
    let iacaBase64: string
    try {
      const { iaca } = await nestApp.get(MdocIssuerCaService).ensureIssuer(tenantAgent.context)
      iacaBase64 = iaca.certificateBase64
    } finally {
      await tenantAgent.endSession()
    }

    const index = await request(app).get('/trust-list').expect(200)
    const indexBody = index.body as { lists: { id: string }[] }
    expect(indexBody.lists.map((entry) => entry.id)).toEqual(['eaa-providers', 'wrpac-providers'])

    const eaa = await request(app).get('/trust-list/eaa-providers').expect(200)
    expect(eaa.headers['content-type']).toMatch(/application\/trustlist\+jwt/)
    const eaaPayload = decodePayload(eaa.text)
    expect(eaaPayload.LoTE.ListAndSchemeInformation.LoTEType).toBe(HEKA_LOTE.type['eaa-providers'])
    const eaaServices = eaaPayload.LoTE.TrustedEntitiesList.flatMap((entity) => entity.TrustedEntityServices)
    const tenantService = eaaServices.find(
      (service) => service.ServiceInformation.ServiceDigitalIdentity?.X509Certificates?.[0].val === iacaBase64,
    )
    expect(tenantService?.ServiceInformation.ServiceTypeIdentifier).toBe(EU_LOTE_SERVICE_TYPE.eaaIssuance)
    expect(tenantService?.ServiceInformation.ServiceInformationExtensions?.[0]).toMatchObject({ origin: 'tenant' })

    const root = await nestApp.get(X509SignerService).getServiceRootCertificate()
    expect(root).not.toBeNull()
    const wrpac = await request(app).get('/trust-list/wrpac-providers').expect(200)
    const wrpacServices = decodePayload(wrpac.text).LoTE.TrustedEntitiesList.flatMap(
      (entity) => entity.TrustedEntityServices,
    )
    expect(wrpacServices).toHaveLength(1)
    expect(wrpacServices[0].ServiceInformation.ServiceTypeIdentifier).toBe(EU_LOTE_SERVICE_TYPE.wrpacIssuance)
    expect(wrpacServices[0].ServiceInformation.ServiceDigitalIdentity?.X509Certificates?.[0].val).toBe(
      root?.certificateBase64,
    )
    // the issuer list never carries the service root, the ACA list never carries issuer anchors
    expect(
      eaaServices.some(
        (service) =>
          service.ServiceInformation.ServiceDigitalIdentity?.X509Certificates?.[0].val === root?.certificateBase64,
      ),
    ).toBe(false)

    await request(app).get('/trust-list/qtsp-providers').expect(404)

    // The ISO VICAL export is optional and off by default: EUDI-shaped consumers use the scheme
    // lists above, which publish the same IACA registry.
    await request(app).get('/vical').expect(404)
  })
})
