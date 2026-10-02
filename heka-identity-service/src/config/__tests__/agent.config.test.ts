import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import agentConfig from 'config/agent'

const EU_ENV = [
  'MDOC_ISSUER_PROFILE',
  'VERIFIER_TRUST_SOURCES',
  'EU_LOTL_URL',
  'EU_LOTL_SIGNER_CERTIFICATES',
  'EU_LOTE_URLS',
  'EU_LOTE_SIGNER_CERTIFICATES',
  'EU_TRUSTED_LIST_SERVICE_TYPES',
  'EU_LOTE_SERVICE_TYPES',
] as const

describe('agent config — startup validation', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const name of EU_ENV) delete process.env[name]
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('accepts the defaults', () => {
    expect(() => agentConfig()).not.toThrow()
  })

  describe('MDOC_ISSUER_PROFILE', () => {
    it.each(['mdl', 'mdl-us', 'mdl-eu', 'eudi-pid', 'eudi-eaa'])('accepts the named preset %s', (name) => {
      process.env.MDOC_ISSUER_PROFILE = name
      expect(agentConfig().mdocIssuerProfile).toBe(name)
    })

    it('refuses to start on an unknown profile name instead of falling back to mDL', () => {
      process.env.MDOC_ISSUER_PROFILE = 'eudi_pid'
      expect(() => agentConfig()).toThrow(
        /MDOC_ISSUER_PROFILE has an unknown value 'eudi_pid' \(allowed: mdl, mdl-us, mdl-eu, eudi-pid, eudi-eaa\)/,
      )
    })
  })

  describe('EU verifier trust sources', () => {
    it('lotl requires EU_LOTL_URL and EU_LOTL_SIGNER_CERTIFICATES', () => {
      process.env.VERIFIER_TRUST_SOURCES = 'registry,lotl'
      expect(() => agentConfig()).toThrow(/includes lotl, which requires EU_LOTL_URL and EU_LOTL_SIGNER_CERTIFICATES/)

      process.env.EU_LOTL_URL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml'
      expect(() => agentConfig()).toThrow(/includes lotl/)

      process.env.EU_LOTL_SIGNER_CERTIFICATES = 'MIIB_COMMISSION'
      expect(agentConfig().verifierTrustSources).toEqual(['registry', 'lotl'])
    })

    it('lote requires EU_LOTE_URLS and EU_LOTE_SIGNER_CERTIFICATES', () => {
      process.env.VERIFIER_TRUST_SOURCES = 'lote'
      expect(() => agentConfig()).toThrow(/includes lote, which requires EU_LOTE_URLS and EU_LOTE_SIGNER_CERTIFICATES/)

      process.env.EU_LOTE_URLS = 'https://ec.example/lote/pid-providers.json'
      process.env.EU_LOTE_SIGNER_CERTIFICATES = 'MIIB_COMMISSION'
      expect(agentConfig().verifierTrustSources).toEqual(['lote'])
    })

    it('the EU variables are not required while their source is off', () => {
      process.env.VERIFIER_TRUST_SOURCES = 'registry,config'
      expect(() => agentConfig()).not.toThrow()
    })

    it('EU_TRUSTED_LIST_SERVICE_TYPES may only narrow to credential-issuer service types', () => {
      process.env.EU_TRUSTED_LIST_SERVICE_TYPES = 'http://uri.etsi.org/TrstSvc/Svctype/EAA/Q'
      expect(() => agentConfig()).not.toThrow()

      process.env.EU_TRUSTED_LIST_SERVICE_TYPES =
        'http://uri.etsi.org/TrstSvc/Svctype/CA/QC, http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST'
      expect(() => agentConfig()).toThrow(
        /EU_TRUSTED_LIST_SERVICE_TYPES may only narrow the credential-issuer service types .*not allowed: http:\/\/uri\.etsi\.org\/TrstSvc\/Svctype\/TSA\/QTST/,
      )
    })

    it('EU_LOTE_SERVICE_TYPES may only narrow to credential-issuer service types', () => {
      process.env.EU_LOTE_SERVICE_TYPES = 'http://uri.etsi.org/19602/SvcType/PID/Issuance'
      expect(() => agentConfig()).not.toThrow()

      process.env.EU_LOTE_SERVICE_TYPES = 'http://uri.etsi.org/19602/SvcType/WRPAC/Issuance'
      expect(() => agentConfig()).toThrow(
        /EU_LOTE_SERVICE_TYPES may only narrow the credential-issuer service types .*not allowed: http:\/\/uri\.etsi\.org\/19602\/SvcType\/WRPAC\/Issuance/,
      )
    })
  })
})
