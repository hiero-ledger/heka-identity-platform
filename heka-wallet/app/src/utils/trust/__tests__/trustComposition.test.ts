import { trustAnchorStore } from '../trustAnchorStore'
import { StaticAnchors } from '../staticAnchors'
import { composeTrustedCertificates } from '../trustComposition'
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
  role: 'access-certificate-authority',
  url: 'https://heka.example/trust-list/wrpac-providers',
  pinnedSigners: ['ROOT'],
}
const sources = [heka, euPid, wrpac]

const staticSets: StaticAnchors = {
  mdocIssuers: ['STATIC_IACA'],
  requestSigners: ['PINNED_VERIFIER_LEAF'],
  serviceRoots: ['SERVICE_ROOT'],
}

describe('composeTrustedCertificates', () => {
  beforeEach(() => {
    trustAnchorStore.clear()
    trustAnchorStore.set(heka.id, ['TENANT_IACA', 'TENANT_SDJWT_LEAF'])
    trustAnchorStore.set(euPid.id, ['PID_PROVIDER'])
    trustAnchorStore.set(wrpac.id, ['ACCESS_CA'])
  })

  test('access-certificate: learned access CAs + the service root + the pinned request signers', () => {
    expect(composeTrustedCertificates(sources, { role: 'access-certificate-authority' }, staticSets)).toEqual([
      'ACCESS_CA',
      'SERVICE_ROOT',
      'PINNED_VERIFIER_LEAF',
    ])
  })

  test('a classified SD-JWT vct is trusted through its classifying source only — the service root does not apply', () => {
    expect(
      composeTrustedCertificates(
        sources,
        { role: 'credential-issuer', format: 'dc+sd-jwt', credentialType: 'urn:eudi:pid:1' },
        staticSets
      )
    ).toEqual(['PID_PROVIDER'])
  })

  test('a classified type stays restricted even while its source has not loaded — trust never widens to the static set', () => {
    trustAnchorStore.set(euPid.id, [])
    expect(
      composeTrustedCertificates(
        sources,
        { role: 'credential-issuer', format: 'dc+sd-jwt', credentialType: 'urn:eudi:pid:1' },
        staticSets
      )
    ).toEqual([])
  })

  test('an unclassified SD-JWT vct: unrestricted issuer sources + the service root (HAIP x5c leaves chain to it)', () => {
    expect(
      composeTrustedCertificates(
        sources,
        { role: 'credential-issuer', format: 'dc+sd-jwt', credentialType: 'https://heka.example/vct/diploma' },
        staticSets
      )
    ).toEqual(['TENANT_IACA', 'TENANT_SDJWT_LEAF', 'SERVICE_ROOT'])
  })

  test('a classified mdoc docType: classifying source only — no static mdoc anchor', () => {
    expect(
      composeTrustedCertificates(
        sources,
        { role: 'credential-issuer', format: 'mso_mdoc', credentialType: 'eu.europa.ec.eudi.pid.1' },
        staticSets
      )
    ).toEqual(['PID_PROVIDER'])
  })

  test('an unclassified mdoc docType: unrestricted issuer sources + the static mdoc anchors, never the root', () => {
    expect(
      composeTrustedCertificates(
        sources,
        { role: 'credential-issuer', format: 'mso_mdoc', credentialType: 'org.iso.18013.5.1.mDL' },
        staticSets
      )
    ).toEqual(['TENANT_IACA', 'TENANT_SDJWT_LEAF', 'STATIC_IACA'])
  })

  test('any other credential format: unrestricted issuer sources + both static sets', () => {
    expect(composeTrustedCertificates(sources, { role: 'credential-issuer', format: 'other' }, staticSets)).toEqual([
      'TENANT_IACA',
      'TENANT_SDJWT_LEAF',
      'SERVICE_ROOT',
      'STATIC_IACA',
    ])
  })

  test('de-duplicates an anchor that is both learned and static', () => {
    trustAnchorStore.set(wrpac.id, ['SERVICE_ROOT'])
    expect(composeTrustedCertificates(sources, { role: 'access-certificate-authority' }, staticSets)).toEqual([
      'SERVICE_ROOT',
      'PINNED_VERIFIER_LEAF',
    ])
  })
})
