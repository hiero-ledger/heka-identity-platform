import { parseCertificate, parseCertificateList, StaticAnchorEnv, StaticAnchors } from './staticAnchors'
import { TrustSourceConfig, TrustSourceEnv, trustSourcesFromConfig } from './trustSources'

/** Everything the wallet's X.509 trust is configured from, loaded once at startup. */
export interface TrustConfiguration {
  staticAnchors: StaticAnchors
  /** The Heka service root CA (`HEKA_SERVICE_ROOT_CERTIFICATE`): zero or one entry. */
  serviceRoots: string[]
  sources: TrustSourceConfig[]
  /** One message per invalid setting; the affected set is left empty (fail closed). */
  errors: string[]
}

export type TrustConfigurationEnv = StaticAnchorEnv & TrustSourceEnv

/**
 * Load and validate the trust configuration. Every setting is parsed independently; an invalid one is
 * reported through `log` and `errors` and contributes **nothing**, so trust never widens because a value
 * was unreadable. The default Heka sources still exist without a usable service root; they are unpinned,
 * so their refresh is skipped.
 */
export function loadTrustConfiguration(
  env: TrustConfigurationEnv,
  log: (message: string) => void = () => undefined
): TrustConfiguration {
  const errors: string[] = []
  const attempt = <T>(fallback: T, load: () => T): T => {
    try {
      return load()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return fallback
    }
  }

  const mdocIssuers = attempt([] as string[], () =>
    parseCertificateList(env.TRUSTED_MDOC_ISSUER_CERTIFICATES, 'TRUSTED_MDOC_ISSUER_CERTIFICATES')
  )
  const requestSigners = attempt([] as string[], () =>
    parseCertificateList(env.TRUSTED_REQUEST_SIGNER_CERTIFICATES, 'TRUSTED_REQUEST_SIGNER_CERTIFICATES')
  )
  const serviceRoots = attempt([] as string[], () =>
    env.HEKA_SERVICE_ROOT_CERTIFICATE?.trim()
      ? [parseCertificate(env.HEKA_SERVICE_ROOT_CERTIFICATE, 'HEKA_SERVICE_ROOT_CERTIFICATE')]
      : []
  )
  const sources = attempt([] as TrustSourceConfig[], () =>
    trustSourcesFromConfig({
      TRUST_SOURCES: env.TRUST_SOURCES,
      AGENCY_PROVIDER_URL: env.AGENCY_PROVIDER_URL,
      HEKA_SERVICE_ROOT_CERTIFICATE: serviceRoots[0],
    })
  )

  for (const error of errors) log(`Trust configuration error — ${error}`)
  return { staticAnchors: { mdocIssuers, requestSigners }, serviceRoots, sources, errors }
}
