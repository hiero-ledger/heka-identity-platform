import { CredentialExchangeRecord, MdocRecord, SdJwtVcRecord, W3cCredentialRecord } from '@credo-ts/core'
import { Field } from '@hyperledger/aries-oca/build/legacy'

export type CredentialRecord = SdJwtVcRecord | W3cCredentialRecord | MdocRecord | CredentialExchangeRecord

export enum CredentialType {
  W3c = 'w3c-credential',
  SdJwt = 'sd-jwt-credential',
  Mdoc = 'mdoc-credential',
  W3cAnoncreds = 'w3c-anoncreds-credential',
}

export interface Credential {
  id: string
  type: CredentialType
  record: CredentialRecord
  display: CredentialDisplay
}

export interface CredentialDisplay {
  name: string
  attributes: Field[]
  locale?: string
  description?: string
  textColor?: string
  backgroundColor?: string
  backgroundImage?: DisplayImage
  logo?: DisplayImage
  watermark?: string
  flaggedAttributeNames?: string[]
  presentationFields?: PresentationFields
  isRevoked?: boolean
  issuer: CredentialIssuerDisplay
}

export interface DisplayImage {
  url?: string
  altText?: string
}

export interface PresentationFields {
  primary?: Field
  secondary?: Field
}

export interface CredentialIssuerDisplay {
  name: string
  backgroundColor?: string
  logo?: DisplayImage
}

export type JffW3cCredentialJson = W3cCredentialJson & {
  name?: string
  description?: string
  credentialBranding?: {
    backgroundColor?: string
  }

  issuer:
    | string
    | (W3cIssuerJson & {
        name?: string
        iconUrl?: string
        logoUrl?: string
        image?: string | { id?: string; type?: 'Image' }
      })
}

export type W3cIssuerJson = {
  id: string
}

export type W3cCredentialSubjectJson = {
  id?: string
  [key: string]: unknown
}

export type W3cCredentialJson = {
  type: Array<string>
  issuer: W3cIssuerJson
  issuanceDate: string
  expiryDate?: string
  credentialSubject: W3cCredentialSubjectJson | W3cCredentialSubjectJson[]
}
