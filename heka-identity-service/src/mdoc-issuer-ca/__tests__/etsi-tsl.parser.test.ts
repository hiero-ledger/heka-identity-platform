import { EU_GENERIC_TSL_TYPE, parseLotlPointers, parseTrustedListAnchors } from '../etsi-tsl.parser'
import { EU_TL_SERVICE_TYPE } from '../eu-service-types'

const QC = EU_TL_SERVICE_TYPE.caQc
const OTHER = 'http://uri.etsi.org/TrstSvc/Svctype/other'
const GRANTED = 'http://uri.etsi.org/TrstSvc/Svcstatus/granted'
const WITHDRAWN = 'http://uri.etsi.org/TrstSvc/Svcstatus/withdrawn'

const LOTL_TYPE = 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists'
const NON_EU_TYPE = 'http://uri.etsi.org/TrstSvc/TrustedList/TSLType/CClist'

const service = (type: string, status: string, certificate: string) => `
  <TSPService><ServiceInformation>
    <ServiceTypeIdentifier>${type}</ServiceTypeIdentifier>
    <ServiceStatus>${status}</ServiceStatus>
    <ServiceDigitalIdentity><DigitalId><X509Certificate>${certificate}</X509Certificate></DigitalId></ServiceDigitalIdentity>
  </ServiceInformation></TSPService>`

const trustedList = (...services: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <TrustServiceProviderList>
    <TrustServiceProvider><TSPServices>${services.join('')}</TSPServices></TrustServiceProvider>
  </TrustServiceProviderList>
</TrustServiceStatusList>`

const pointer = (opts: { location: string; signers?: string[]; tslType?: string; territory?: string }) => {
  const identities = (opts.signers ?? [])
    .map(
      (cert) =>
        `<ServiceDigitalIdentity><DigitalId><X509Certificate>${cert}</X509Certificate></DigitalId></ServiceDigitalIdentity>`,
    )
    .join('')
  return `
    <OtherTSLPointer>
      <ServiceDigitalIdentities>${identities}</ServiceDigitalIdentities>
      <TSLLocation>${opts.location}</TSLLocation>
      <AdditionalInformation>
        <OtherInformation><TSLType>${opts.tslType ?? EU_GENERIC_TSL_TYPE}</TSLType></OtherInformation>
        ${opts.territory ? `<OtherInformation><SchemeTerritory>${opts.territory}</SchemeTerritory></OtherInformation>` : ''}
        <OtherInformation><MimeType>application/vnd.etsi.tsl+xml</MimeType></OtherInformation>
      </AdditionalInformation>
    </OtherTSLPointer>`
}

const lotl = (...pointers: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation>
    <PointersToOtherTSL>${pointers.join('')}</PointersToOtherTSL>
  </SchemeInformation>
</TrustServiceStatusList>`

describe('parseTrustedListAnchors', () => {
  test('extracts only the granted X509 anchors of credential-issuer service types', () => {
    const xml = trustedList(
      service(QC, GRANTED, 'MIIB_QC'),
      service(QC, WITHDRAWN, 'MIIB_WITHDRAWN'),
      service(OTHER, GRANTED, 'MIIB_OTHER'),
    )
    expect(parseTrustedListAnchors(xml)).toEqual(['MIIB_QC'])
  })

  test('H4: the default gate admits qualified CAs and QEAA / PuB-EAA issuance, never TSAs, QWAC CAs, roots or validators', () => {
    const xml = trustedList(
      service(EU_TL_SERVICE_TYPE.caQc, GRANTED, 'MIIB_CA_QC'),
      service(EU_TL_SERVICE_TYPE.eaaQ, GRANTED, 'MIIB_QEAA'),
      service(EU_TL_SERVICE_TYPE.pubEaa, GRANTED, 'MIIB_PUB_EAA'),
      service(EU_TL_SERVICE_TYPE.eaa, GRANTED, 'MIIB_EAA_NONQ'),
      service(EU_TL_SERVICE_TYPE.tsa, GRANTED, 'MIIB_TSA'),
      service(EU_TL_SERVICE_TYPE.qtst, GRANTED, 'MIIB_QTST'),
      service(EU_TL_SERVICE_TYPE.caPkc, GRANTED, 'MIIB_QWAC_CA'),
      service(EU_TL_SERVICE_TYPE.nationalRootCaQc, GRANTED, 'MIIB_NATIONAL_ROOT'),
      service(EU_TL_SERVICE_TYPE.eaaValidation, GRANTED, 'MIIB_VALIDATOR'),
    )
    expect(parseTrustedListAnchors(xml)).toEqual(['MIIB_CA_QC', 'MIIB_QEAA', 'MIIB_PUB_EAA'])
  })

  test('filters by ServiceTypeIdentifier when an allow-list is given', () => {
    const xml = trustedList(service(QC, GRANTED, 'MIIB_QC'), service(OTHER, GRANTED, 'MIIB_OTHER'))
    expect(parseTrustedListAnchors(xml, { serviceTypes: [QC] })).toEqual(['MIIB_QC'])
    expect(parseTrustedListAnchors(xml, { serviceTypes: [OTHER] })).toEqual(['MIIB_OTHER'])
  })

  test('an explicit empty allow-list yields no anchors (never "everything")', () => {
    const xml = trustedList(service(QC, GRANTED, 'MIIB_QC'), service(OTHER, GRANTED, 'MIIB_OTHER'))
    expect(parseTrustedListAnchors(xml, { serviceTypes: [] })).toEqual([])
  })

  test('strips whitespace inside a certificate and deduplicates', () => {
    const xml = trustedList(service(QC, GRANTED, 'MIIB\n  _QC'), service(QC, GRANTED, 'MIIB_QC'))
    expect(parseTrustedListAnchors(xml)).toEqual(['MIIB_QC'])
  })

  test('handles a namespace-prefixed (tsl:) Trusted List', () => {
    const xml = `<?xml version="1.0"?>
<tsl:TrustServiceStatusList xmlns:tsl="http://uri.etsi.org/02231/v2#">
  <tsl:TrustServiceProviderList><tsl:TrustServiceProvider><tsl:TSPServices>
    <tsl:TSPService><tsl:ServiceInformation>
      <tsl:ServiceTypeIdentifier>${QC}</tsl:ServiceTypeIdentifier>
      <tsl:ServiceStatus>${GRANTED}</tsl:ServiceStatus>
      <tsl:ServiceDigitalIdentity><tsl:DigitalId>
        <tsl:X509Certificate>MIIB_QC</tsl:X509Certificate>
      </tsl:DigitalId></tsl:ServiceDigitalIdentity>
    </tsl:ServiceInformation></tsl:TSPService>
  </tsl:TSPServices></tsl:TrustServiceProvider></tsl:TrustServiceProviderList>
</tsl:TrustServiceStatusList>`
    expect(parseTrustedListAnchors(xml)).toEqual(['MIIB_QC'])
  })

  test('ignores non-certificate digital-identity forms (X509SubjectName / X509SKI)', () => {
    const xml = `<?xml version="1.0"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#"><TrustServiceProviderList><TrustServiceProvider><TSPServices>
  <TSPService><ServiceInformation>
    <ServiceTypeIdentifier>${QC}</ServiceTypeIdentifier><ServiceStatus>${GRANTED}</ServiceStatus>
    <ServiceDigitalIdentity><DigitalId><X509SubjectName>CN=Foo</X509SubjectName></DigitalId></ServiceDigitalIdentity>
  </ServiceInformation></TSPService>
</TSPServices></TrustServiceProvider></TrustServiceProviderList></TrustServiceStatusList>`
    expect(parseTrustedListAnchors(xml)).toEqual([])
  })

  test('returns no anchors for empty / non-TL input', () => {
    expect(parseTrustedListAnchors('')).toEqual([])
    expect(parseTrustedListAnchors('   ')).toEqual([])
    expect(parseTrustedListAnchors('not xml at all')).toEqual([])
    expect(parseTrustedListAnchors('<html><body/></html>')).toEqual([])
  })
})

describe('parseLotlPointers', () => {
  test('extracts national (EUgeneric) pointers with location + declared signer + territory', () => {
    const xml = lotl(
      pointer({ location: 'https://de.example/tl.xml', signers: ['MIIB_DE'], territory: 'DE' }),
      pointer({ location: 'https://fr.example/tl.xml', signers: ['MIIB_FR'], territory: 'FR' }),
    )
    expect(parseLotlPointers(xml)).toEqual([
      {
        location: 'https://de.example/tl.xml',
        expectedSigners: ['MIIB_DE'],
        schemeTerritory: 'DE',
        tslType: EU_GENERIC_TSL_TYPE,
      },
      {
        location: 'https://fr.example/tl.xml',
        expectedSigners: ['MIIB_FR'],
        schemeTerritory: 'FR',
        tslType: EU_GENERIC_TSL_TYPE,
      },
    ])
  })

  test('excludes the LoTL self-pointer and non-EU pointers by default', () => {
    const xml = lotl(
      pointer({ location: 'https://ec.europa.eu/lotl.xml', signers: ['MIIB_EC'], tslType: LOTL_TYPE }),
      pointer({ location: 'https://non-eu.example/tl.xml', signers: ['MIIB_X'], tslType: NON_EU_TYPE }),
      pointer({ location: 'https://de.example/tl.xml', signers: ['MIIB_DE'], territory: 'DE' }),
    )
    expect(parseLotlPointers(xml).map((p) => p.location)).toEqual(['https://de.example/tl.xml'])
  })

  test('tslTypes: [] includes pointers of every type', () => {
    const xml = lotl(
      pointer({ location: 'https://ec.europa.eu/lotl.xml', signers: ['MIIB_EC'], tslType: LOTL_TYPE }),
      pointer({ location: 'https://de.example/tl.xml', signers: ['MIIB_DE'], territory: 'DE' }),
    )
    expect(parseLotlPointers(xml, { tslTypes: [] })).toHaveLength(2)
  })

  test('filters by SchemeTerritory when an allow-list is given', () => {
    const xml = lotl(
      pointer({ location: 'https://de.example/tl.xml', signers: ['MIIB_DE'], territory: 'DE' }),
      pointer({ location: 'https://fr.example/tl.xml', signers: ['MIIB_FR'], territory: 'FR' }),
    )
    expect(parseLotlPointers(xml, { schemeTerritories: ['FR'] }).map((p) => p.schemeTerritory)).toEqual(['FR'])
  })

  test('collects multiple declared signers and strips whitespace', () => {
    const xml = lotl(
      pointer({ location: 'https://de.example/tl.xml', signers: ['MIIB\n  _A', 'MIIB_B'], territory: 'DE' }),
    )
    expect(parseLotlPointers(xml)[0]?.expectedSigners).toEqual(['MIIB_A', 'MIIB_B'])
  })

  test('keeps a pointer with no declared signer (caller fails it closed) but skips one with no location', () => {
    const xml = lotl(
      pointer({ location: 'https://de.example/tl.xml', signers: [], territory: 'DE' }),
      pointer({ location: '', signers: ['MIIB_X'], territory: 'FR' }),
    )
    const result = parseLotlPointers(xml)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ location: 'https://de.example/tl.xml', expectedSigners: [] })
  })

  test('handles a namespace-prefixed (tsl:) LoTL', () => {
    const xml = `<?xml version="1.0"?>
<tsl:TrustServiceStatusList xmlns:tsl="http://uri.etsi.org/02231/v2#">
  <tsl:SchemeInformation><tsl:PointersToOtherTSL><tsl:OtherTSLPointer>
    <tsl:ServiceDigitalIdentities><tsl:ServiceDigitalIdentity><tsl:DigitalId>
      <tsl:X509Certificate>MIIB_DE</tsl:X509Certificate>
    </tsl:DigitalId></tsl:ServiceDigitalIdentity></tsl:ServiceDigitalIdentities>
    <tsl:TSLLocation>https://de.example/tl.xml</tsl:TSLLocation>
    <tsl:AdditionalInformation>
      <tsl:OtherInformation><tsl:TSLType>${EU_GENERIC_TSL_TYPE}</tsl:TSLType></tsl:OtherInformation>
      <tsl:OtherInformation><tsl:SchemeTerritory>DE</tsl:SchemeTerritory></tsl:OtherInformation>
    </tsl:AdditionalInformation>
  </tsl:OtherTSLPointer></tsl:PointersToOtherTSL></tsl:SchemeInformation>
</tsl:TrustServiceStatusList>`
    expect(parseLotlPointers(xml)).toEqual([
      {
        location: 'https://de.example/tl.xml',
        expectedSigners: ['MIIB_DE'],
        schemeTerritory: 'DE',
        tslType: EU_GENERIC_TSL_TYPE,
      },
    ])
  })

  test('returns no pointers for empty / non-LoTL input', () => {
    expect(parseLotlPointers('')).toEqual([])
    expect(parseLotlPointers('   ')).toEqual([])
    expect(parseLotlPointers('not xml at all')).toEqual([])
    expect(parseLotlPointers('<html><body/></html>')).toEqual([])
  })
})
