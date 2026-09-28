import {
  EU_MDL_PROFILE,
  EUDI_EAA_PROFILE,
  EUDI_PID_PROFILE,
  ID_ETSI_QCT_PID_OID,
  isProfileName,
  MDL_DOCUMENT_SIGNER_EKU_OID,
  MDL_PROFILE,
  PROFILE_NAMES,
  resolveProfile,
} from '../certificate-profiles'

describe('certificate profiles — TS 119 412-6 V1.1.1 intent', () => {
  test('the PID profile carries the id-etsi-qct-pid QcType, policies, AIA and no EKU', () => {
    expect(EUDI_PID_PROFILE).toMatchObject({
      credentialType: 'pid',
      ecosystem: 'eu',
      dscQcTypes: [ID_ETSI_QCT_PID_OID],
      requiresCertificatePolicies: true,
      requiresAuthorityInformationAccess: true,
      usesOrganizationIdentifier: true,
    })
    expect(EUDI_PID_PROFILE.dscExtendedKeyUsage).toBeUndefined()
    expect(ID_ETSI_QCT_PID_OID).toBe('0.4.0.194126.1.1')
  })

  test('the EAA profile is the same EN 319 412-3 legal-person shape without a QcType', () => {
    expect(EUDI_EAA_PROFILE).toMatchObject({
      credentialType: 'eaa',
      ecosystem: 'eu',
      requiresCertificatePolicies: true,
      requiresAuthorityInformationAccess: true,
      usesOrganizationIdentifier: true,
    })
    expect(EUDI_EAA_PROFILE.dscQcTypes).toBeUndefined()
    expect(EUDI_EAA_PROFILE.dscExtendedKeyUsage).toBeUndefined()
  })

  test('mDL keeps the ISO mdlDS EKU (critical) in both ecosystems; only the EU variant adds the EU bits', () => {
    for (const profile of [MDL_PROFILE, EU_MDL_PROFILE]) {
      expect(profile.dscExtendedKeyUsage).toEqual({ oids: [MDL_DOCUMENT_SIGNER_EKU_OID], critical: true })
      expect(profile.dscQcTypes).toBeUndefined()
    }
    expect(MDL_PROFILE).toMatchObject({
      requiresCertificatePolicies: false,
      requiresAuthorityInformationAccess: false,
      usesOrganizationIdentifier: false,
    })
    expect(EU_MDL_PROFILE).toMatchObject({
      requiresCertificatePolicies: true,
      requiresAuthorityInformationAccess: true,
      usesOrganizationIdentifier: true,
    })
  })

  test('validity keeps the ISO 18013-5 caps for every profile (no ETSI cap exists)', () => {
    for (const profile of [MDL_PROFILE, EU_MDL_PROFILE, EUDI_PID_PROFILE, EUDI_EAA_PROFILE]) {
      expect(profile.dscValidityDays).toBeLessThanOrEqual(457)
      expect(profile.iacaValidityDays).toBeLessThanOrEqual(365 * 9)
    }
  })

  test.each([
    [undefined, 'mdl-us'],
    ['mdl', 'mdl-us'],
    ['mdl-us', 'mdl-us'],
    ['mdl-eu', 'mdl-eu'],
    ['eudi', 'eudi-pid'],
    ['eudi-pid', 'eudi-pid'],
    ['eudi-eaa', 'eudi-eaa'],
    [{ profile: 'eudi-eaa' }, 'eudi-eaa'],
    [{ credentialType: 'mdl', ecosystem: 'eu' }, 'mdl-eu'],
    [{ credentialType: 'pid', ecosystem: 'eu' }, 'eudi-pid'],
    [{ credentialType: 'pid-eaa', ecosystem: 'eu' }, 'eudi-pid'],
    [{ credentialType: 'eaa', ecosystem: 'eu' }, 'eudi-eaa'],
    [{ credentialType: 'pid', ecosystem: 'us' }, 'mdl-us'],
  ] as const)('resolveProfile(%j) → %s', (selector, expected) => {
    expect(resolveProfile(selector as never).name).toBe(expected)
  })

  test('every named preset resolves to itself', () => {
    for (const name of PROFILE_NAMES) expect(resolveProfile(name)).toBe(resolveProfile({ profile: name }))
  })

  test.each(['unknown', 'eudi_pid', 'EUDI-PID', 'toString', ''])(
    'an unknown preset name %j throws instead of degrading to the mDL profile',
    (name) => {
      if (name === '') {
        // Empty = "nothing specified" → the default, same as undefined.
        expect(resolveProfile(name).name).toBe('mdl-us')
        return
      }
      expect(() => resolveProfile(name)).toThrow(/Unknown certificate profile "[^"]*" \(expected one of mdl, mdl-us/)
      expect(() => resolveProfile({ profile: name as never })).toThrow(/Unknown certificate profile/)
    },
  )

  test('an unknown credential-type / ecosystem pair throws', () => {
    expect(() => resolveProfile({ credentialType: 'mdl', ecosystem: 'xx' as never })).toThrow(
      /Unknown certificate profile selector/,
    )
    expect(() => resolveProfile({ credentialType: 'passport' as never, ecosystem: 'eu' })).toThrow(
      /Unknown certificate profile selector/,
    )
  })

  test('isProfileName accepts exactly the named presets', () => {
    for (const name of PROFILE_NAMES) expect(isProfileName(name)).toBe(true)
    expect(isProfileName('eudi_pid')).toBe(false)
    expect(isProfileName('constructor')).toBe(false)
  })
})
