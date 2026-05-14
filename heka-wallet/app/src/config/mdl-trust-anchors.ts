// WARNING: Development/test certificates only.
// These are NEVER included in release builds (__DEV__ === false).
// Do NOT add production CA certs here.
export const DEV_MDL_TRUST_ANCHORS: [string, ...string[]] = [
  'MIIBwDCCAWWgAwIBAgIUSMdjaVc1KHI+3o6qJXhSC4sJh+cwCgYIKoZIzj0EAwIwNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMB4XDTI2MDMyNzIxNDA1NloXDTM2MDMyNDIxNDA1NlowNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1nIrm3O9VX8MdPrKWMhqqV0QMS4UtxKj6uUc8IdGE2fSsWyi7XQN3HoE1Ln9TDtOIHvSyW8Eyr98MlWGBBF/vqNTMFEwHQYDVR0OBBYEFNfkrHxd2nwtni96XrrYhaMgUFImMB8GA1UdIwQYMBaAFNfkrHxd2nwtni96XrrYhaMgUFImMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAP0V5EW7j6Pb+lJktzdWrtEqhI3mYs9Fd+qh0p2kNXJPAiEAqK+q7Wk+t5e2yzvO3b6t3P5nIEnoQt3cvDsaUZY1dT0=',
]

export const PROD_MDL_TRUST_ANCHORS: string[] = [
  // production CA certs only — leave empty if none exist yet
]

/**
 * Returns the MDL issuer trust anchor list for the current build flavor.
 * Dev certs are NEVER included in release builds.
 * @security Do not add dev/test certs to PROD_MDL_TRUST_ANCHORS.
 */
export function getMdlTrustAnchors(): [string, ...string[]] | undefined {
  if (__DEV__) return DEV_MDL_TRUST_ANCHORS
  return PROD_MDL_TRUST_ANCHORS.length > 0 ? (PROD_MDL_TRUST_ANCHORS as [string, ...string[]]) : undefined
}
