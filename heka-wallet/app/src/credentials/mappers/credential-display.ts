import { AnonCredsCredentialMetadataKey } from '@credo-ts/anoncreds'
import { ConnectionRecord, CredentialExchangeRecord, CredentialPreviewAttribute, Mdoc } from '@credo-ts/core'
import { getHostNameFromUrl, sanitizeString } from '@heka-wallet/shared'
import { BifoldAgent } from '@hyperledger/aries-bifold-core'
import { i18n } from '@hyperledger/aries-bifold-core/App/localization'
import { getCredentialIdentifiers } from '@hyperledger/aries-bifold-core/App/utils/credential'
import { BrandingOverlay } from '@hyperledger/aries-oca'
import {
  Attribute,
  BrandingOverlayType,
  CredentialOverlay,
  RemoteOCABundleResolver,
} from '@hyperledger/aries-oca/build/legacy'

import { agencyProviderURL, fallbackDisplay } from '../../config'
import { OpenId4VcCredentialMetadata } from '../metadata'
import {
  CredentialDisplay,
  CredentialIssuerDisplay,
  JffW3cCredentialJson,
  PresentationFields,
  W3cCredentialJson,
} from '../types'

import { getAttributesAndMetadataForMdocPayload } from './mdoc'
import { filterAndMapSdJwtKeys } from './sd-jwt'
import { parseCredentialName } from './utils'

const UNKNOWN_CREDENTIAL_LABEL = 'Unknown credential'
const UNKNOWN_ISSUER_LABEL = 'Unknown issuer'

export function getSdJwtCredentialDisplay(
  credentialPayload: Record<string, unknown>,
  openId4VcMetadata?: OpenId4VcCredentialMetadata | null
): CredentialDisplay {
  const credentialDisplay: Partial<CredentialDisplay> = {}

  if (openId4VcMetadata) {
    const openidCredentialDisplay = findDisplay(openId4VcMetadata.credential.display)

    if (openidCredentialDisplay) {
      credentialDisplay.name = openidCredentialDisplay.name
      credentialDisplay.description = openidCredentialDisplay.description
      credentialDisplay.textColor = openidCredentialDisplay.text_color
      credentialDisplay.backgroundColor = openidCredentialDisplay.background_color

      if (openidCredentialDisplay.logo) {
        credentialDisplay.logo = {
          url: openidCredentialDisplay.logo.url,
          altText: openidCredentialDisplay.logo.alt_text,
        }
      }
    }
  }

  // If there's no name for the credential, we extract it from the last type
  // and sanitize it. This is not optimal. But provides at least something.
  if (!credentialDisplay.name && typeof credentialPayload.vct === 'string') {
    credentialDisplay.name = sanitizeString(credentialPayload.vct)
  }

  const issuerDisplay = getOpenId4VcIssuerDisplay(openId4VcMetadata)

  // Use background color fallback
  if (!credentialDisplay.backgroundColor) {
    credentialDisplay.backgroundColor = issuerDisplay.backgroundColor ?? fallbackDisplay.credential.color
  }

  if (!credentialDisplay.logo) {
    credentialDisplay.logo = {
      url: issuerDisplay.logo?.url ?? fallbackDisplay.credential.logo,
    }
  }

  if (!issuerDisplay.logo) {
    issuerDisplay.logo = {
      url: fallbackDisplay.issuer.logo,
    }
  }

  if (!issuerDisplay.backgroundColor) {
    issuerDisplay.backgroundColor = fallbackDisplay.issuer.color
  }

  return {
    ...credentialDisplay,
    // Last fallback, if there's really no name for the credential, we use a generic name
    name: credentialDisplay.name ?? UNKNOWN_CREDENTIAL_LABEL,
    attributes: filterAndMapSdJwtKeys(credentialPayload).attributes,
    issuer: issuerDisplay,
  }
}

export function getW3cCredentialDisplay(
  credential: W3cCredentialJson,
  openId4VcMetadata?: OpenId4VcCredentialMetadata | null
): CredentialDisplay {
  const credentialDisplay: Partial<CredentialDisplay> = {}

  if (openId4VcMetadata) {
    const openidCredentialDisplay = findDisplay(openId4VcMetadata.credential.display)

    if (openidCredentialDisplay) {
      credentialDisplay.name = openidCredentialDisplay.name
      credentialDisplay.description = openidCredentialDisplay.description
      credentialDisplay.textColor = openidCredentialDisplay.text_color
      credentialDisplay.backgroundColor = openidCredentialDisplay.background_color

      if (openidCredentialDisplay.logo) {
        credentialDisplay.logo = {
          url: openidCredentialDisplay.logo.url,
          altText: openidCredentialDisplay.logo.alt_text,
        }
      }
    }
  }

  // If openid metadata is not available, try to extract display metadata from the credential based on JFF metadata
  const jffCredential = credential as JffW3cCredentialJson

  if (!credentialDisplay.name) {
    credentialDisplay.name = jffCredential.name
  }

  // If there's no name for the credential, we extract it from the last type (at least something)
  if (!credentialDisplay.name && jffCredential.type.length > 1) {
    const lastType = jffCredential.type[jffCredential.type.length - 1]
    if (lastType && !lastType.startsWith('http')) {
      credentialDisplay.name = sanitizeString(lastType)
    }
  }

  const issuerDisplay = getW3cIssuerDisplay(credential, openId4VcMetadata)

  // Use background color fallbacks (JFF credential or generated color)
  if (!credentialDisplay.backgroundColor) {
    credentialDisplay.backgroundColor =
      jffCredential.credentialBranding?.backgroundColor ??
      issuerDisplay.backgroundColor ??
      fallbackDisplay.credential.color
  }

  if (!credentialDisplay.logo) {
    credentialDisplay.logo = {
      url: issuerDisplay.logo?.url ?? fallbackDisplay.credential.logo,
    }
  }

  if (!issuerDisplay.logo) {
    issuerDisplay.logo = {
      url: fallbackDisplay.issuer.logo,
    }
  }

  if (!issuerDisplay.backgroundColor) {
    issuerDisplay.backgroundColor = fallbackDisplay.issuer.color
  }

  // FIXME: Support credential with multiple subjects
  const credentialSubject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0] ?? {}
    : credential.credentialSubject

  const attributes = Object.keys(credentialSubject).map((key) => {
    let value = credentialSubject[key] as any

    if (typeof value !== 'string' && typeof value !== 'number') {
      value = JSON.stringify(value)
    }

    return new Attribute({ name: key, value })
  })

  return {
    ...credentialDisplay,
    name: credentialDisplay.name ?? UNKNOWN_CREDENTIAL_LABEL,
    attributes,
    issuer: issuerDisplay,
  }
}

export function getMdocCredentialDisplay(
  mdocInstance: Mdoc,
  openId4VcMetadata?: OpenId4VcCredentialMetadata | null
): CredentialDisplay {
  const credentialDisplay: Partial<CredentialDisplay> = {}

  if (openId4VcMetadata) {
    const openidCredentialDisplay = findDisplay(openId4VcMetadata.credential.display)

    if (openidCredentialDisplay) {
      credentialDisplay.name = openidCredentialDisplay.name
      credentialDisplay.description = openidCredentialDisplay.description
      credentialDisplay.textColor = openidCredentialDisplay.text_color
      credentialDisplay.backgroundColor = openidCredentialDisplay.background_color

      if (openidCredentialDisplay.background_image) {
        credentialDisplay.backgroundImage = {
          url: openidCredentialDisplay.background_image.url,
          altText: openidCredentialDisplay.background_image.alt_text,
        }
      }

      // NOTE: logo is used in issuer display (not sure if that's right though)
    }
  }

  const issuerDisplay = getOpenId4VcIssuerDisplay(openId4VcMetadata)

  // Use background color fallback
  if (!credentialDisplay.backgroundColor) {
    credentialDisplay.backgroundColor = issuerDisplay.backgroundColor ?? fallbackDisplay.credential.color
  }

  if (!credentialDisplay.logo) {
    credentialDisplay.logo = {
      url: issuerDisplay.logo?.url ?? fallbackDisplay.credential.logo,
    }
  }

  if (!issuerDisplay.logo) {
    issuerDisplay.logo = {
      url: fallbackDisplay.issuer.logo,
    }
  }

  if (!issuerDisplay.backgroundColor) {
    issuerDisplay.backgroundColor = fallbackDisplay.issuer.color
  }

  const { attributes } = getAttributesAndMetadataForMdocPayload(mdocInstance.issuerSignedNamespaces, mdocInstance)

  return {
    ...credentialDisplay,
    name: credentialDisplay.name ?? mdocInstance.docType,
    attributes,
    issuer: issuerDisplay,
  }
}

export async function resolveOverlay(credentialRecord: CredentialExchangeRecord, connection?: ConnectionRecord | null) {
  const credentialIdentifiers = getCredentialIdentifiers(credentialRecord)

  const resolverParams = {
    identifiers: credentialIdentifiers,
    attributes: credentialRecord.credentialAttributes,
    meta: {
      credConnectionId: credentialRecord.connectionId,
      alias: connection?.alias ?? connection?.theirLabel ?? UNKNOWN_ISSUER_LABEL,
    },
    language: i18n.language,
  }

  const bundleResolver = new RemoteOCABundleResolver(`${agencyProviderURL}/oca`, {
    language: i18n.language,
    brandingOverlayType: BrandingOverlayType.Branding10,
  })

  await bundleResolver.checkForUpdates()

  return (await bundleResolver.resolveAllBundles(resolverParams)) as CredentialOverlay<BrandingOverlay>
}

export async function getAnoncredsCredentialDisplay(
  credentialRecord: CredentialExchangeRecord,
  agent: BifoldAgent
): Promise<CredentialDisplay> {
  const issuerConnection = await agent.connections.findById(credentialRecord.connectionId ?? '')

  const offerMessage = await agent.credentials.findOfferMessage(credentialRecord.id)
  const comment = offerMessage?.comment

  // Metadata is empty for not yet accepted credentials - need to populate manually
  if (!credentialRecord.metadata.get(AnonCredsCredentialMetadataKey) || !credentialRecord.credentialAttributes) {
    const formatData = await agent.credentials.getFormatData(credentialRecord.id)
    const { offer, offerAttributes } = formatData

    const anoncredsOfferData = offer?.anoncreds ?? offer?.indy

    if (anoncredsOfferData) {
      credentialRecord.metadata.add(AnonCredsCredentialMetadataKey, {
        schemaId: anoncredsOfferData.schema_id,
        credentialDefinitionId: anoncredsOfferData.cred_def_id,
      })
    } else if (offer?.dataIntegrity) {
      credentialRecord.metadata.add(AnonCredsCredentialMetadataKey, {
        // @ts-expect-error - 'dataIntegrity' object has incorrect type (camel case instead of actual snake case)
        credentialDefinitionId: offer?.dataIntegrity?.binding_method?.anoncreds_link_secret?.cred_def_id,
        // @ts-expect-error - same as above
        schemaId: offer?.dataIntegrity?.binding_method?.anoncreds_link_secret?.schema_id,
      })
    }

    if (offerAttributes) {
      credentialRecord.credentialAttributes = [...offerAttributes.map((item) => new CredentialPreviewAttribute(item))]
    }
  }

  const credentialIdentifiers = getCredentialIdentifiers(credentialRecord)

  const bundleOverlay = await resolveOverlay(credentialRecord, issuerConnection)

  const presentationFields: PresentationFields = {
    primary: bundleOverlay.presentationFields?.find(
      (field) => field.name === bundleOverlay.brandingOverlay?.primaryAttribute
    ),
    secondary: bundleOverlay.presentationFields?.find(
      (field) => field.name === bundleOverlay.brandingOverlay?.primaryAttribute
    ),
  }

  // We need to parse credential name separately from 'bundleOverlay' to properly support qualified DIDs and non-Indy methods
  const credentialName = parseCredentialName(
    credentialIdentifiers.credentialDefinitionId,
    credentialIdentifiers.schemaId,
    comment
  )

  return {
    name: credentialName,
    attributes: credentialRecord.credentialAttributes ?? [],
    backgroundColor: bundleOverlay.brandingOverlay?.primaryBackgroundColor ?? fallbackDisplay.credential.color,
    watermark: bundleOverlay.metaOverlay?.watermark,
    logo: { url: bundleOverlay.brandingOverlay?.logo ?? issuerConnection?.imageUrl ?? fallbackDisplay.issuer.logo },
    flaggedAttributeNames: (bundleOverlay as any).bundle.bundle.flaggedAttributes.map((attr: any) => attr.name),
    presentationFields,
    isRevoked: !!credentialRecord.revocationNotification,
    issuer: {
      name: bundleOverlay.metaOverlay?.issuer ?? credentialRecord.connectionId ?? UNKNOWN_ISSUER_LABEL,
      logo: { url: issuerConnection?.imageUrl ?? fallbackDisplay.issuer.logo },
      backgroundColor: fallbackDisplay.issuer.color,
    },
    locale: i18n.language,
  }
}

function findDisplay<Display extends { locale?: string }>(display?: Display[]): Display | undefined {
  if (!display) return undefined

  let item = display.find((d) => d.locale?.startsWith('en-'))
  if (!item) item = display.find((d) => !d.locale)
  if (!item) item = display[0]

  return item
}

function getW3cIssuerDisplay(
  credential: W3cCredentialJson,
  openId4VcMetadata?: OpenId4VcCredentialMetadata | null
): CredentialIssuerDisplay {
  const issuerDisplay: Partial<CredentialIssuerDisplay> = getOpenId4VcIssuerDisplay(openId4VcMetadata)

  // If openid metadata is not available, try to extract display metadata from the credential based on JFF metadata
  const jffCredential = credential as JffW3cCredentialJson
  const issuerJson = typeof jffCredential.issuer === 'string' ? undefined : jffCredential.issuer

  // Issuer Display from JFF
  if (!issuerDisplay.logo || !issuerDisplay.logo.url) {
    if (issuerJson?.logoUrl) {
      issuerDisplay.logo = {
        url: issuerJson?.logoUrl,
      }
    } else if (issuerJson?.image) {
      issuerDisplay.logo = {
        url: typeof issuerJson.image === 'string' ? issuerJson.image : issuerJson.image.id,
      }
    }
  }

  // Issuer name from JFF
  if (!issuerDisplay.name) {
    issuerDisplay.name = issuerJson?.name
  }

  // Last fallback: use issuer id from openid4vc
  if (!issuerDisplay.name && openId4VcMetadata?.issuer.id) {
    issuerDisplay.name = getHostNameFromUrl(openId4VcMetadata.issuer.id)
  }

  return {
    ...issuerDisplay,
    name: issuerDisplay.name ?? UNKNOWN_ISSUER_LABEL,
  }
}

export function getOpenId4VcIssuerDisplay(
  openId4VcMetadata?: OpenId4VcCredentialMetadata | null
): CredentialIssuerDisplay {
  const issuerDisplay: Partial<CredentialIssuerDisplay> = {}

  // Try to extract from openid metadata first
  if (openId4VcMetadata) {
    const openidIssuerDisplay = findDisplay(openId4VcMetadata.issuer.display)

    if (openidIssuerDisplay) {
      issuerDisplay.name = openidIssuerDisplay.name
      issuerDisplay.backgroundColor = openidIssuerDisplay.background_color

      if (openidIssuerDisplay.logo) {
        issuerDisplay.logo = {
          url: openidIssuerDisplay.logo?.url,
          altText: openidIssuerDisplay.logo?.alt_text,
        }
      }
    }

    // If the credentialDisplay contains a logo, and the issuerDisplay does not, use the logo from the credentialDisplay
    const openidCredentialDisplay = findDisplay(openId4VcMetadata.credential.display)
    if (openidCredentialDisplay && !issuerDisplay.logo && openidCredentialDisplay.logo) {
      issuerDisplay.logo = {
        url: openidCredentialDisplay.logo?.url,
        altText: openidCredentialDisplay.logo?.alt_text,
      }
    }
  }

  // Last fallback: use issuer id from openid4vc
  if (!issuerDisplay.name && openId4VcMetadata?.issuer.id) {
    issuerDisplay.name = getHostNameFromUrl(openId4VcMetadata.issuer.id)
  }

  return {
    ...issuerDisplay,
    name: issuerDisplay.name ?? UNKNOWN_ISSUER_LABEL,
  }
}
