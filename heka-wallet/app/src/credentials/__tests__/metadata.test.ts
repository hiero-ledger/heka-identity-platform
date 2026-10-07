import { extractOpenId4VcCredentialMetadata } from '../metadata'

const serverMetadata = { id: 'https://issuer.example/oid4vci', display: [{ name: 'Issuer' }] }

describe('extractOpenId4VcCredentialMetadata', () => {
  it('reads display from credential_metadata (OID4VCI 1.0)', () => {
    const display = [{ name: 'Driving license', logo: { uri: 'https://issuer.example/logo.png' } }]
    const result = extractOpenId4VcCredentialMetadata(
      { format: 'dc+sd-jwt', vct: 'Driving license', credential_metadata: { display } } as any,
      serverMetadata
    )
    expect(result.credential.display).toEqual(display)
  })

  it('falls back to top-level display (OID4VCI draft 14/15 issuers)', () => {
    const display = [{ name: 'Driving license', logo: { uri: 'https://issuer.example/logo.png' } }]
    const result = extractOpenId4VcCredentialMetadata(
      { format: 'vc+sd-jwt', vct: 'Driving license', display } as any,
      serverMetadata
    )
    expect(result.credential.display).toEqual(display)
  })

  it('leaves display undefined when neither shape is present', () => {
    const result = extractOpenId4VcCredentialMetadata(
      { format: 'vc+sd-jwt', vct: 'Driving license' } as any,
      serverMetadata
    )
    expect(result.credential.display).toBeUndefined()
    expect(result.issuer).toEqual({ id: serverMetadata.id, display: serverMetadata.display })
  })
})
