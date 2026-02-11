import {
  ClaimFormat,
  CredentialExchangeRecord,
  CredentialRepository,
  Hasher,
  JsonTransformer,
  Mdoc,
  MdocRecord,
  SdJwtVcRecord,
  W3cCredentialRecord,
} from '@credo-ts/core'
import { BifoldAgent } from '@hyperledger/aries-bifold-core'
import { decodeSdJwt, getClaims } from '@sd-jwt/decode'

import { getOpenId4VcCredentialMetadata } from '../metadata'
import { Credential, CredentialRecord, CredentialType, W3cCredentialJson } from '../types'

import {
  getAnoncredsCredentialDisplay,
  getMdocCredentialDisplay,
  getSdJwtCredentialDisplay,
  getW3cCredentialDisplay,
} from './credential-display'

export async function mapCredentialRecord(credentialRecord: CredentialRecord, agent: BifoldAgent): Promise<Credential> {
  if (credentialRecord instanceof SdJwtVcRecord) {
    return mapSdJwtCredentialRecord(credentialRecord)
  } else if (credentialRecord instanceof W3cCredentialRecord) {
    return mapW3cCredentialRecord(credentialRecord, agent)
  } else if (credentialRecord instanceof CredentialExchangeRecord) {
    return mapAnoncredsCredentialRecord(credentialRecord, agent)
  } else {
    return mapMdocCredentialRecord(credentialRecord)
  }
}

async function mapSdJwtCredentialRecord(credentialRecord: SdJwtVcRecord): Promise<Credential> {
  const { disclosures, jwt } = await decodeSdJwt(credentialRecord.compactSdJwtVc, (data, alg) => Hasher.hash(data, alg))
  const decodedPayload: Record<string, unknown> = await getClaims(jwt.payload, disclosures, (data, alg) =>
    Hasher.hash(data, alg)
  )

  const openId4VcMetadata = getOpenId4VcCredentialMetadata(credentialRecord)
  const credentialDisplay = getSdJwtCredentialDisplay(decodedPayload, openId4VcMetadata)

  // TODO: Metadata attributes
  return {
    id: credentialRecord.id,
    type: CredentialType.SdJwt,
    record: credentialRecord,
    display: credentialDisplay,
  }
}

async function mapW3cCredentialRecord(credentialRecord: W3cCredentialRecord, agent: BifoldAgent): Promise<Credential> {
  // W3C Anoncreds
  if (credentialRecord.getTag('anonCredsSchemaId')) {
    const credentialExchangeRepository = agent.context.dependencyManager.resolve(CredentialRepository)
    const credentialExchangeRecord = await credentialExchangeRepository.getSingleByQuery(agent.context, {
      credentialIds: [credentialRecord.id],
    })
    const credentialDisplay = await getAnoncredsCredentialDisplay(credentialExchangeRecord, agent)
    return {
      id: credentialRecord.id,
      type: CredentialType.W3cAnoncreds,
      record: credentialRecord,
      display: credentialDisplay,
    }
  }

  const credential = JsonTransformer.toJSON(
    credentialRecord.credential.claimFormat === ClaimFormat.JwtVc
      ? credentialRecord.credential.credential
      : credentialRecord.credential
  ) as W3cCredentialJson

  const openId4VcMetadata = getOpenId4VcCredentialMetadata(credentialRecord)
  const credentialDisplay = getW3cCredentialDisplay(credential, openId4VcMetadata)

  return {
    id: credentialRecord.id,
    type: CredentialType.W3c,
    display: credentialDisplay,
    record: credentialRecord,
  }
}

async function mapMdocCredentialRecord(credentialRecord: MdocRecord): Promise<Credential> {
  const mdocInstance = Mdoc.fromBase64Url(credentialRecord.base64Url)
  const openId4VcMetadata = getOpenId4VcCredentialMetadata(credentialRecord)
  const credentialDisplay = getMdocCredentialDisplay(mdocInstance, openId4VcMetadata)

  return {
    id: credentialRecord.id,
    type: CredentialType.Mdoc,
    display: credentialDisplay,
    record: credentialRecord,
  }
}

async function mapAnoncredsCredentialRecord(
  credentialRecord: CredentialExchangeRecord,
  agent: BifoldAgent
): Promise<Credential> {
  const credentialDisplay = await getAnoncredsCredentialDisplay(credentialRecord, agent)

  return {
    id: credentialRecord.id,
    type: CredentialType.W3cAnoncreds,
    record: credentialRecord,
    display: credentialDisplay,
  }
}
