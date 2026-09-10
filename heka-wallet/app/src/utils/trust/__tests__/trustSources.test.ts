import {
  defaultTrustSources,
  HEKA_EAA_PROVIDERS_SOURCE_ID,
  HEKA_WRPAC_PROVIDERS_SOURCE_ID,
  parseTrustSources,
  trustSourcesFromConfig,
} from '../trustSources'

const ROOT = 'MIID_ROOT'

describe('defaultTrustSources', () => {
  test('derives the two Heka scheme lists from the agency URL, pinned to the service root', () => {
    const sources = defaultTrustSources({
      AGENCY_PROVIDER_URL: 'https://heka.example/',
      HEKA_SERVICE_ROOT_CERTIFICATE: ROOT,
    })
    expect(sources).toEqual([
      {
        id: HEKA_EAA_PROVIDERS_SOURCE_ID,
        role: 'credential-issuer',
        url: 'https://heka.example/trust-list/eaa-providers',
        pinnedSigners: [ROOT],
      },
      {
        id: HEKA_WRPAC_PROVIDERS_SOURCE_ID,
        role: 'access-certificate',
        url: 'https://heka.example/trust-list/wrpac-providers',
        pinnedSigners: [ROOT],
      },
    ])
  })

  test('without a service root the defaults exist but pin nothing (refresh will skip them)', () => {
    const sources = defaultTrustSources({ AGENCY_PROVIDER_URL: 'https://heka.example' })
    expect(sources.map((source) => source.pinnedSigners)).toEqual([[], []])
  })

  test('without an agency URL there are no default sources', () => {
    expect(defaultTrustSources({})).toEqual([])
  })
})

describe('trustSourcesFromConfig', () => {
  test('explicit TRUST_SOURCES replaces the defaults entirely', () => {
    const sources = trustSourcesFromConfig({
      AGENCY_PROVIDER_URL: 'https://heka.example',
      HEKA_SERVICE_ROOT_CERTIFICATE: ROOT,
      TRUST_SOURCES: JSON.stringify([
        { id: 'eu-pid', role: 'credential-issuer', url: 'https://ec.example/pid', pinnedSigners: ['OJEU'] },
      ]),
    })
    expect(sources.map((source) => source.id)).toEqual(['eu-pid'])
  })

  test('a blank TRUST_SOURCES falls back to the defaults', () => {
    const sources = trustSourcesFromConfig({ AGENCY_PROVIDER_URL: 'https://heka.example', TRUST_SOURCES: '  ' })
    expect(sources.map((source) => source.id)).toEqual([HEKA_EAA_PROVIDERS_SOURCE_ID, HEKA_WRPAC_PROVIDERS_SOURCE_ID])
  })
})

describe('parseTrustSources', () => {
  const valid = {
    id: 'eu-pid',
    role: 'credential-issuer',
    url: 'https://ec.example/pid-providers',
    pinnedSigners: ['MIID\nOJEU '],
    classification: { docTypes: ['eu.europa.ec.eudi.pid.1'], vcts: ['urn:eudi:pid:1'] },
    followPointers: true,
  }

  test('accepts a full entry and normalizes certificate whitespace', () => {
    expect(parseTrustSources(JSON.stringify([valid]))).toEqual([
      {
        id: 'eu-pid',
        role: 'credential-issuer',
        url: 'https://ec.example/pid-providers',
        pinnedSigners: ['MIIDOJEU'],
        classification: { docTypes: ['eu.europa.ec.eudi.pid.1'], vcts: ['urn:eudi:pid:1'] },
        followPointers: true,
      },
    ])
  })

  test('classification and followPointers are optional', () => {
    const { classification: _c, followPointers: _f, ...minimal } = valid
    const [source] = parseTrustSources(JSON.stringify([minimal]))
    expect(source.classification).toBeUndefined()
    expect(source.followPointers).toBeUndefined()
  })

  test.each([
    ['not JSON', 'nope', /not valid JSON/],
    ['not an array', '{}', /must be a JSON array/],
    ['entry not an object', '["x"]', /\[0\]: must be an object/],
    ['missing id', JSON.stringify([{ ...valid, id: '' }]), /\[0\]\.id/],
    ['bad role', JSON.stringify([{ ...valid, role: 'issuer' }]), /\[0\]\.role/],
    ['non-http url', JSON.stringify([{ ...valid, url: 'ftp://x' }]), /\[0\]\.url/],
    ['empty pinnedSigners', JSON.stringify([{ ...valid, pinnedSigners: [] }]), /\[0\]\.pinnedSigners/],
    ['blank pinned signer', JSON.stringify([{ ...valid, pinnedSigners: [' '] }]), /pinnedSigners\[0\]/],
    ['classification not an object', JSON.stringify([{ ...valid, classification: [] }]), /classification: must/],
    ['docTypes not an array', JSON.stringify([{ ...valid, classification: { docTypes: 'x' } }]), /docTypes/],
    ['followPointers not a boolean', JSON.stringify([{ ...valid, followPointers: 'yes' }]), /followPointers/],
    ['duplicate id', JSON.stringify([valid, valid]), /duplicate id "eu-pid"/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseTrustSources(raw)).toThrow(message)
  })
})
