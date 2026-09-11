import { trustAnchorStore } from '../trustAnchorStore'
import { resolveTrustAnchors, selectTrustSources } from '../trustResolver'
import { TrustSourceConfig } from '../trustSources'

const heka: TrustSourceConfig = {
  id: 'heka-eaa-providers',
  role: 'credential-issuer',
  url: 'https://heka.example/trust-list/eaa-providers',
  pinnedSigners: ['ROOT'],
}
const euPid: TrustSourceConfig = {
  id: 'eu-pid-providers',
  role: 'credential-issuer',
  url: 'https://ec.example/pid',
  pinnedSigners: ['OJEU'],
  classification: { docTypes: ['eu.europa.ec.eudi.pid.1'], vcts: ['urn:eudi:pid:1'] },
}
const wrpac: TrustSourceConfig = {
  id: 'heka-wrpac-providers',
  role: 'access-certificate',
  url: 'https://heka.example/trust-list/wrpac-providers',
  pinnedSigners: ['ROOT'],
}
const sources = [heka, euPid, wrpac]

describe('resolveTrustAnchors', () => {
  beforeEach(() => {
    trustAnchorStore.clear()
    trustAnchorStore.set(heka.id, ['TENANT_IACA', 'SHARED'])
    trustAnchorStore.set(euPid.id, ['PID_PROVIDER', 'SHARED'])
    trustAnchorStore.set(wrpac.id, ['SERVICE_ROOT'])
  })

  test('an access-certificate subject sees only access-certificate sources', () => {
    expect(resolveTrustAnchors(sources, { role: 'access-certificate' })).toEqual(['SERVICE_ROOT'])
  })

  test('an unclassified mdoc docType is covered by the unrestricted issuer sources only', () => {
    expect(
      resolveTrustAnchors(sources, {
        role: 'credential-issuer',
        format: 'mso_mdoc',
        credentialType: 'org.iso.18013.5.1.mDL',
      })
    ).toEqual(['TENANT_IACA', 'SHARED'])
  })

  test('a classified mdoc docType is trusted ONLY through the sources classifying it', () => {
    expect(
      resolveTrustAnchors(sources, {
        role: 'credential-issuer',
        format: 'mso_mdoc',
        credentialType: 'eu.europa.ec.eudi.pid.1',
      })
    ).toEqual(['PID_PROVIDER', 'SHARED'])
  })

  test('a classified type stays exclusive even while its source has not loaded (no widening on failure)', () => {
    trustAnchorStore.clear()
    trustAnchorStore.set(heka.id, ['TENANT_IACA'])
    expect(
      resolveTrustAnchors(sources, {
        role: 'credential-issuer',
        format: 'mso_mdoc',
        credentialType: 'eu.europa.ec.eudi.pid.1',
      })
    ).toEqual([])
  })

  test('SD-JWT VCs are classified by vct, not by docType', () => {
    expect(
      resolveTrustAnchors(sources, { role: 'credential-issuer', format: 'dc+sd-jwt', credentialType: 'urn:eudi:pid:1' })
    ).toEqual(['PID_PROVIDER', 'SHARED'])
    // the PID docType string is not a vct → unrestricted sources apply
    expect(
      resolveTrustAnchors(sources, {
        role: 'credential-issuer',
        format: 'dc+sd-jwt',
        credentialType: 'eu.europa.ec.eudi.pid.1',
      })
    ).toEqual(['TENANT_IACA', 'SHARED'])
  })

  test('other credential formats (no type) use the unrestricted issuer sources', () => {
    expect(resolveTrustAnchors(sources, { role: 'credential-issuer', format: 'other' })).toEqual([
      'TENANT_IACA',
      'SHARED',
    ])
  })

  test('anchors are de-duplicated across sources', () => {
    const both: TrustSourceConfig = { ...euPid, id: 'eu-pid-2', classification: undefined }
    trustAnchorStore.set(both.id, ['SHARED', 'OTHER'])
    expect(
      resolveTrustAnchors([heka, both], { role: 'credential-issuer', format: 'mso_mdoc', credentialType: 'x' })
    ).toEqual(['TENANT_IACA', 'SHARED', 'OTHER'])
  })

  test('an empty store yields no learned anchors', () => {
    trustAnchorStore.clear()
    expect(resolveTrustAnchors(sources, { role: 'access-certificate' })).toEqual([])
  })
})

describe('selectTrustSources', () => {
  test('returns the classifying sources for a classified type and the unrestricted ones otherwise', () => {
    expect(
      selectTrustSources(sources, {
        role: 'credential-issuer',
        format: 'mso_mdoc',
        credentialType: 'eu.europa.ec.eudi.pid.1',
      }).map((s) => s.id)
    ).toEqual([euPid.id])
    expect(
      selectTrustSources(sources, {
        role: 'credential-issuer',
        format: 'mso_mdoc',
        credentialType: 'org.iso.18013.5.1.mDL',
      }).map((s) => s.id)
    ).toEqual([heka.id])
    expect(selectTrustSources(sources, { role: 'access-certificate' }).map((s) => s.id)).toEqual([wrpac.id])
  })
})
