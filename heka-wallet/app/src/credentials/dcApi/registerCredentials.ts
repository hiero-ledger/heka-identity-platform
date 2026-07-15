import {
  type DigitalCredentialsApiMatcher,
  type RegisterCredentialsOptions,
  registerCredentials,
} from '@animo-id/expo-digital-credentials-api'
import { DateOnly, MdocNameSpaces, MdocRecord, SdJwtVcRecord } from '@credo-ts/core'
import { Platform } from 'react-native'

import { HekaWalletAgent } from '../../utils/agent'
import { mapCredentialRecord } from '../mappers/credential'
import { humanizeAttributeName } from '../mappers/humanize'
import { CredentialRecord } from '../types'

type CredentialItem = RegisterCredentialsOptions['credentials'][number]
type CredentialDisplayClaim = NonNullable<CredentialItem['display']['claims']>[number]
type SdJwtDcClaims = Extract<CredentialItem['credential'], { format: 'dc+sd-jwt' }>['claims']

const DC_API_MATCHER: DigitalCredentialsApiMatcher = 'ubique'

// Standard SD-JWT VC envelope claims that shouldn't be surfaced as user-facing attributes.
const SD_JWT_ENVELOPE_CLAIMS = new Set([
  'iss',
  'vct',
  'cnf',
  'iat',
  'exp',
  'nbf',
  'status',
  '_sd',
  '_sd_alg',
  '_sd_hash',
])

interface CredentialLabels {
  titleFallback: string
  subtitle: (issuerName: string) => string
  subtitleFallback: string
}

export interface DcApiRegisterCredentialsOptions {
  /** Display label overrides (e.g. localized strings injected from a component). */
  labels?: Partial<CredentialLabels>
}

/**
 * Registers all mdoc and SD-JWT VC credentials with the Android Credential Manager so they become
 * discoverable to verifier websites via the Digital Credentials API.
 */
export async function dcApiRegisterCredentials(
  agent: HekaWalletAgent,
  { labels }: DcApiRegisterCredentialsOptions = {}
): Promise<void> {
  if (Platform.OS !== 'android') return

  const resolvedLabels: CredentialLabels = {
    titleFallback: labels?.titleFallback ?? 'Credential',
    subtitle: labels?.subtitle ?? ((issuerName: string) => `Issued by ${issuerName}`),
    subtitleFallback: labels?.subtitleFallback ?? 'Unknown issuer',
  }

  try {
    const [mdocRecords, sdJwtVcRecords] = await Promise.all([agent.mdoc.getAll(), agent.sdJwtVc.getAll()])

    const credentials = await Promise.all([
      ...mdocRecords.map((record) => buildMdocCredentialItem(agent, record, resolvedLabels)),
      ...sdJwtVcRecords.map((record) => buildSdJwtCredentialItem(agent, record, resolvedLabels)),
    ])

    agent.config.logger.trace('Registering credentials for the Digital Credentials API', {
      count: credentials.length,
    })

    await registerCredentials({ credentials, matcher: DC_API_MATCHER })
  } catch (error) {
    const errorMessage = error instanceof Error ? (error.stack ?? error.message) : String(error)
    agent.config.logger.error('Error registering credentials for the Digital Credentials API', { error: errorMessage })
  }
}

async function buildMdocCredentialItem(
  agent: HekaWalletAgent,
  record: MdocRecord,
  labels: CredentialLabels
): Promise<CredentialItem> {
  const mdoc = record.firstCredential
  const display = await resolveDisplay(agent, record, labels)

  return {
    id: record.id,
    credential: {
      doctype: mdoc.docType,
      format: 'mso_mdoc',
      namespaces: mapMdocNamespaces(mdoc.issuerSignedNamespaces),
    },
    display: {
      ...display,
      claims: mapMdocClaimDisplay(mdoc.issuerSignedNamespaces),
    },
  }
}

async function buildSdJwtCredentialItem(
  agent: HekaWalletAgent,
  record: SdJwtVcRecord,
  labels: CredentialLabels
): Promise<CredentialItem> {
  const sdJwtVc = record.firstCredential
  const display = await resolveDisplay(agent, record, labels)

  return {
    id: record.id,
    credential: {
      vct: record.getTags().vct,
      format: 'dc+sd-jwt',
      claims: sdJwtVc.prettyClaims as unknown as SdJwtDcClaims,
    },
    display: {
      ...display,
      claims: mapSdJwtClaimDisplay(sdJwtVc.prettyClaims),
    },
  }
}

async function resolveDisplay(
  agent: HekaWalletAgent,
  record: CredentialRecord,
  labels: CredentialLabels
): Promise<{ title: string; subtitle: string }> {
  try {
    const { display } = await mapCredentialRecord(record, agent)
    return {
      title: display.name || labels.titleFallback,
      subtitle: display.issuer?.name ? labels.subtitle(display.issuer.name) : labels.subtitleFallback,
    }
  } catch {
    return { title: labels.titleFallback, subtitle: labels.subtitleFallback }
  }
}

// Maps mdoc namespaces to primitive values; complex/nested values become `null` (not matchable)
function mapMdocNamespaces(
  namespaces: MdocNameSpaces
): Record<string, Record<string, string | number | boolean | null>> {
  return Object.fromEntries(
    Object.entries(namespaces).map(([namespace, values]) => [
      namespace,
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return [key, value]
          }
          if (value instanceof Date || value instanceof DateOnly) {
            return [key, value.toISOString()]
          }
          return [key, null]
        })
      ),
    ])
  )
}

function mapMdocClaimDisplay(namespaces: MdocNameSpaces): CredentialDisplayClaim[] {
  return Object.entries(namespaces).flatMap(([namespace, values]) =>
    Object.keys(values).map((key) => ({ path: [namespace, key], displayName: humanizeAttributeName(key) }))
  )
}

function mapSdJwtClaimDisplay(claims: Record<string, unknown>, path: string[] = []): CredentialDisplayClaim[] {
  return Object.entries(claims).flatMap(([key, value]) => {
    if (path.length === 0 && SD_JWT_ENVELOPE_CLAIMS.has(key)) {
      return []
    }

    const nestedClaims =
      value && typeof value === 'object' && !Array.isArray(value)
        ? mapSdJwtClaimDisplay(value as Record<string, unknown>, [...path, key])
        : []

    return [{ path: [...path, key], displayName: humanizeAttributeName(key) }, ...nestedClaims]
  })
}
