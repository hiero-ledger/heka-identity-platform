import {
  AnonCredsCredentialMetadataKey,
  AnonCredsPredicateType,
  AnonCredsProof,
  AnonCredsProofRequest,
  AnonCredsProofRequestRestriction,
  AnonCredsRequestedAttribute,
  AnonCredsRequestedAttributeMatch,
  AnonCredsRequestedPredicate,
  AnonCredsRequestedPredicateMatch,
} from '@credo-ts/anoncreds'
import {
  DifPexCredentialsForRequestSubmissionEntry,
  ProofExchangeRecord,
  ClaimFormat,
  Agent,
  GetProofFormatDataReturn,
  CredentialRepository,
  DifPresentationExchangeService,
} from '@credo-ts/core'
import { BifoldAgent } from '@hyperledger/aries-bifold-core'
import { groupSharedProofDataByCredential } from '@hyperledger/aries-bifold-verifier'
import { ParsedAnonCredsProof } from '@hyperledger/aries-bifold-verifier/src/types/proof'
import { parseAnonCredsProof } from '@hyperledger/aries-bifold-verifier/src/utils/proof'
import { Attribute } from '@hyperledger/aries-oca/build/legacy'

import {
  Credential,
  OpenId4VcPresentationRequest,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
  AnoncredsPresentationSubmission,
  CredentialSubmissionOption,
  ProofExchangeFormatKeys,
} from '../types'

import { mapCredentialRecord } from './credential'
import { filterAndMapSdJwtKeys } from './sd-jwt'
import { parseCredentialName } from './utils'

const ANONCREDS_PREDICATE_MAP: Record<AnonCredsPredicateType, string> = {
  '>': 'greater than',
  '>=': 'greater than or equal to',
  '<': 'less than',
  '<=': 'less than or equal to',
}

/**
 * Format requested predicate into string
 * @example `age greater than 18`
 */
function formatAnoncredsPredicate(requestedPredicate: AnonCredsRequestedPredicate) {
  return `${requestedPredicate.name} ${ANONCREDS_PREDICATE_MAP[requestedPredicate.p_type]} ${requestedPredicate.p_value}`
}

function getAnoncredsCredentialNameFromRestrictions(restrictions?: AnonCredsProofRequestRestriction[]): string {
  let schema_name = ''
  let cred_def_id = ''
  let schema_id = ''
  restrictions?.forEach((restriction) => {
    schema_name = (restriction?.schema_name as string) ?? schema_name
    cred_def_id = (restriction?.cred_def_id as string) ?? cred_def_id
    schema_id = (restriction?.schema_id as string) ?? schema_id
  })
  if (schema_name && (schema_name.toLowerCase() !== 'default' || schema_name.toLowerCase() !== 'credential')) {
    return schema_name
  } else {
    return parseCredentialName(cred_def_id, schema_id)
  }
}

export async function mapOpenId4VcPresentationRequest(
  presentationRequest: OpenId4VcPresentationRequest,
  agent: BifoldAgent
): Promise<OpenIdPresentationSubmission> {
  const { credentialsForRequest, authorizationRequest, verifierHostName } = presentationRequest

  const entries: PresentationSubmissionEntry[] = []

  for (const requirement of credentialsForRequest.requirements) {
    const requirementEntries = await Promise.all(
      requirement.submissionEntry.map((entry) => formatSubmissionEntry(entry, agent))
    )
    entries.push(...requirementEntries)
  }

  return {
    type: PresentationSubmissionType.OpenId4VP,
    name: credentialsForRequest.name ?? 'Unknown',
    areAllSatisfied: entries.every((entry) => entry.isSatisfied),
    purpose: credentialsForRequest.purpose,
    submissionParams: {
      credentialsForRequest,
      authorizationRequest,
    },
    verifierName: verifierHostName,
    entries,
  }
}

async function formatSubmissionEntry(
  submissionEntry: DifPexCredentialsForRequestSubmissionEntry,
  agent: BifoldAgent
): Promise<PresentationSubmissionEntry> {
  const submissionOptions = await Promise.all(
    submissionEntry.verifiableCredentials.map(async (verifiableCredential) => {
      const credential = await mapCredentialRecord(verifiableCredential.credentialRecord, agent)

      // TODO: Nesting support
      const requestedAttributes =
        verifiableCredential.type === ClaimFormat.SdJwtVc
          ? filterAndMapSdJwtKeys(verifiableCredential.disclosedPayload).attributes
          : (credential.display.attributes as Attribute[])

      return {
        credential,
        requestedAttributes,
      }
    })
  )

  const isSubmissionEntrySatisfied = !!submissionEntry.verifiableCredentials.length
  return {
    inputDescriptorId: submissionEntry.inputDescriptorId,
    name: submissionEntry.name ?? 'Unknown',
    description: submissionEntry.purpose,
    isSatisfied: isSubmissionEntrySatisfied,
    selectedOption: isSubmissionEntrySatisfied ? submissionOptions[0] : null,
    submissionOptions,
  }
}

export async function mapAnoncredsProofExchangeRecord(
  proofExchangeRecord: ProofExchangeRecord,
  agent: BifoldAgent
): Promise<AnoncredsPresentationSubmission> {
  const repository = agent.dependencyManager.resolve(CredentialRepository)
  const formatData = await agent.proofs.getFormatData(proofExchangeRecord.id)

  let formatKey: ProofExchangeFormatKeys
  let submissionName: string
  let entriesArray: PresentationSubmissionEntry[] = []

  const entriesMap = new Map<
    string,
    {
      name: string
      groupNames: { attributes: string[]; predicates: string[] }
      matches: Array<AnonCredsRequestedPredicateMatch>
      requestedAttributes: Set<string>
    }
  >()

  if (formatData.request?.presentationExchange) {
    const presentationDefinition = formatData.request.presentationExchange.presentation_definition
    if (!presentationDefinition) {
      throw new Error('Invalid proof request')
    }

    const presentationExchangeService = agent.dependencyManager.resolve(DifPresentationExchangeService)
    const credentialsForRequest = await presentationExchangeService.getCredentialsForRequest(
      agent.context,
      presentationDefinition
    )

    formatKey = ProofExchangeFormatKeys.PresentationExchange
    submissionName = credentialsForRequest.name ?? 'Unknown'

    for (const requirement of credentialsForRequest.requirements) {
      const requirementEntries = await Promise.all(
        requirement.submissionEntry.map((entry) => formatSubmissionEntry(entry, agent))
      )
      entriesArray.push(...requirementEntries)
    }
  } else {
    const proofRequest = formatData.request?.anoncreds ?? formatData.request?.indy

    const credentialsForRequest = await agent.proofs.getCredentialsForRequest({
      proofRecordId: proofExchangeRecord.id,
    })

    formatKey =
      formatData.request?.anoncreds !== undefined ? ProofExchangeFormatKeys.Anoncreds : ProofExchangeFormatKeys.Indy
    submissionName = proofRequest?.name ?? 'Unknown'

    const anonCredsCredentials = credentialsForRequest.proofFormats.anoncreds ?? credentialsForRequest.proofFormats.indy
    if (!anonCredsCredentials || !proofRequest) {
      throw new Error('Invalid proof request.')
    }

    const mergeOrSetEntry = (
      type: 'attribute' | 'predicate',
      groupName: string,
      requestedValue: AnonCredsRequestedAttribute | AnonCredsRequestedPredicate,
      matches: AnonCredsRequestedAttributeMatch[] | AnonCredsRequestedPredicateMatch[]
    ) => {
      const entryName = getAnoncredsCredentialNameFromRestrictions(requestedValue.restrictions)

      // We create an entry hash. This way we can group all items that have the same credentials
      // available. If no credentials are available for a group, we create an entry hash based
      // on the credential name
      const entryHash = groupName.includes('__CREDENTIAL__')
        ? groupName.split('__CREDENTIAL__')[0]
        : matches.length > 0
          ? matches
              .map((a) => a.credentialId)
              .sort()
              .join(',')
          : entryName

      const requestedAttributeNames =
        type === 'attribute'
          ? (requestedValue as AnonCredsRequestedAttribute).names ?? [requestedValue.name as string]
          : formatAnoncredsPredicate(requestedValue as AnonCredsRequestedPredicate)

      const entry = entriesMap.get(entryHash)

      if (!entry) {
        entriesMap.set(entryHash, {
          name: entryName,
          groupNames: {
            attributes: type === 'attribute' ? [groupName] : [],
            predicates: type === 'predicate' ? [groupName] : [],
          },
          matches,
          requestedAttributes: new Set(requestedAttributeNames),
        })
        return
      }

      if (type === 'attribute') {
        entry.groupNames.attributes.push(groupName)
      } else {
        entry.groupNames.predicates.push(groupName)
      }

      entry.requestedAttributes = new Set([...requestedAttributeNames, ...entry.requestedAttributes])

      // We only include the matches which are present in both entries. If we use the __CREDENTIAL__ it means we can only use
      // credentials that match both. For the other ones we create a 'hash' from all available credentialIds
      // first already, so it should give the same result.
      entry.matches = entry.matches.filter((match) =>
        matches.some((innerMatch) => match.credentialId === innerMatch.credentialId)
      )
    }

    const allCredentialIds = [
      ...Object.values(anonCredsCredentials.attributes).flatMap((matches) =>
        matches.map((match) => match.credentialId)
      ),
      ...Object.values(anonCredsCredentials.predicates).flatMap((matches) =>
        matches.map((match) => match.credentialId)
      ),
    ]
    const credentialExchanges = await repository.findByQuery(agent.context, {
      $or: allCredentialIds.map((credentialId) => ({ credentialIds: [credentialId] })),
    })

    for (const [groupName, attributeArray] of Object.entries(anonCredsCredentials.attributes)) {
      const requestedAttribute = proofRequest.requested_attributes[groupName]
      if (!requestedAttribute) throw new Error('Invalid presentation request')

      mergeOrSetEntry('attribute', groupName, requestedAttribute, attributeArray)
    }

    for (const [groupName, predicateArray] of Object.entries(anonCredsCredentials.predicates)) {
      const requestedPredicate = proofRequest.requested_predicates[groupName]
      if (!requestedPredicate) throw new Error('Invalid presentation request')

      mergeOrSetEntry('predicate', groupName, requestedPredicate, predicateArray)
    }

    entriesArray = await Promise.all(
      Array.from(entriesMap.entries()).map(async ([entryHash, entry]) => {
        const submissionOptions: CredentialSubmissionOption[] = await Promise.all(
          entry.matches.map(async (match) => {
            const credentialRecord = credentialExchanges.find((record) =>
              record.credentials.find((recordBinding) => recordBinding.credentialRecordId === match.credentialId)
            )

            if (!credentialRecord) {
              throw new Error('Matched credential exchange record is not found')
            }

            const credential = await mapCredentialRecord(credentialRecord, agent)
            const requestedAttributes = credential.display.attributes.filter((attribute) =>
              entry.requestedAttributes.has(attribute.name)
            )

            return {
              id: match.credentialId,
              credential,
              isSatisfied: true,
              requestedAttributes: requestedAttributes as Attribute[],
            }
          })
        )

        const isSubmissionEntrySatisfied = !!submissionOptions.length
        return {
          inputDescriptorId: entryHash,
          name: entry.name,
          isSatisfied: isSubmissionEntrySatisfied,
          selectedOption: isSubmissionEntrySatisfied ? submissionOptions[0] : null,
          submissionOptions,
        }
      })
    )
  }

  const verifierConnection = proofExchangeRecord.connectionId
    ? await agent.connections.getById(proofExchangeRecord.connectionId)
    : null
  const outOfBandRecord = verifierConnection?.outOfBandId
    ? await agent.oob.getById(verifierConnection.outOfBandId)
    : null

  return {
    type: PresentationSubmissionType.ProofExchange,
    name: submissionName,
    purpose: outOfBandRecord?.outOfBandInvitation.goal,
    outOfBandGoalCode: outOfBandRecord?.outOfBandInvitation.goalCode,
    areAllSatisfied: entriesArray.every((entry) => entry.isSatisfied),
    verifierName: verifierConnection?.theirLabel,
    verifierLogoUrl: verifierConnection?.imageUrl,
    entries: entriesArray,
    proofExchangeRecord: proofExchangeRecord,
    entriesWithAnoncredsMatches: entriesMap,
    formatKey,
  }
}

interface SharedAttribute {
  name: string
  value: string
}

export interface PresentationDetails {
  shared: Array<SharedAttribute>
  credential?: Credential
}

export function prepareIndyPresentationData(
  parsedAnonCredsProof: ParsedAnonCredsProof,
  credentials: Credential[]
): Array<PresentationDetails> {
  const result: Array<PresentationDetails> = []

  const groupedSharedProofData = groupSharedProofDataByCredential(parsedAnonCredsProof)
  for (const sharedCredentialData of groupedSharedProofData.values()) {
    const credential = credentials.find((c) => {
      const credDefId = c.record.metadata?.get(AnonCredsCredentialMetadataKey)?.credentialDefinitionId
      return credDefId === sharedCredentialData.identifiers.cred_def_id
    })

    const shared: Array<SharedAttribute> = sharedCredentialData.data.sharedAttributes ?? []
    if (sharedCredentialData.data.sharedAttributeGroups) {
      for (const attributeGroup of sharedCredentialData.data.sharedAttributeGroups) {
        for (const attribute of attributeGroup.attributes) {
          shared.push(attribute)
        }
      }
    }
    if (sharedCredentialData.data.resolvedPredicates) {
      for (const predicate of sharedCredentialData.data.resolvedPredicates) {
        shared.push({
          name: predicate.name,
          value: `${predicate.predicateType} ${predicate.predicateValue}`,
        })
      }
    }

    result.push({
      shared,
      credential,
    })
  }
  return result
}

export function prepareW3CPresentationData(
  presentationExchange: {
    verifiableCredential: Array<{
      credentialSubject: Record<string, string>
      proof: {
        verificationMethod: string
      }
    }>
  },
  credentials: Credential[]
): Array<PresentationDetails> {
  const result: Array<PresentationDetails> = []

  for (const verifiableCredential of presentationExchange.verifiableCredential) {
    const sharedAttributes = Object.keys(verifiableCredential.credentialSubject).map((attribute) => ({
      name: attribute,
      value: verifiableCredential.credentialSubject[attribute],
    }))

    const credential = credentials.find((c) => {
      const credDefId = c.record.metadata?.get(AnonCredsCredentialMetadataKey)?.credentialDefinitionId
      return credDefId === verifiableCredential.proof.verificationMethod
    })

    result.push({
      shared: sharedAttributes,
      credential,
    })
  }
  return result
}

export async function preparePresentationData(
  record: ProofExchangeRecord,
  agent: Agent,
  credentials: Credential[]
): Promise<Array<PresentationDetails>> {
  const formatData: GetProofFormatDataReturn = await agent.proofs.getFormatData(record.id)

  if (formatData.request?.anoncreds && formatData.presentation?.anoncreds) {
    const presentation = parseAnonCredsProof(
      formatData.request.anoncreds as AnonCredsProofRequest,
      formatData.presentation.anoncreds as AnonCredsProof
    )
    return prepareIndyPresentationData(presentation, credentials)
  } else if (formatData.request?.indy && formatData.presentation?.indy) {
    const presentation = parseAnonCredsProof(
      formatData.request.indy as AnonCredsProofRequest,
      formatData.presentation.indy as AnonCredsProof
    )
    return prepareIndyPresentationData(presentation, credentials)
  } else if (formatData.request?.presentationExchange && formatData.presentation?.presentationExchange) {
    const presentation = formatData.presentation?.presentationExchange
    // @ts-ignore
    return prepareW3CPresentationData(presentation, credentials)
  } else {
    throw new Error('Usupported presentation format')
  }
}
