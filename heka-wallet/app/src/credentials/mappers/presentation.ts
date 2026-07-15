import { Attribute } from '@bifold/oca/build/legacy'
import { groupSharedProofDataByCredential, parseAnonCredsProof, ParsedAnonCredsProof } from '@bifold/verifier'
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
  ClaimFormat,
  DcqlMatchWithRecord,
  DcqlQueryResult,
  DifPexCredentialsForRequest,
  DifPexCredentialsForRequestSubmissionEntry,
  DifPresentationExchangeService,
  MdocNameSpaces,
} from '@credo-ts/core'
import { DidCommCredentialExchangeRepository, DidCommProofExchangeRecord } from '@credo-ts/didcomm'

import { HekaWalletAgent } from '../../utils/agent'
import {
  AnoncredsPresentationSubmission,
  Credential,
  CredentialSubmissionOption,
  OpenId4VcPresentationRequest,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
  ProofExchangeFormatKeys,
} from '../types'

import { mapCredentialRecord } from './credential'
import { getAttributesAndMetadataForMdocPayload } from './mdoc'
import { getAttributesAndMetadataForSdJwtPayload } from './sd-jwt'
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
  agent: HekaWalletAgent
): Promise<OpenIdPresentationSubmission> {
  const { credentialsForRequest, queryResult, authorizationRequest, verifierHostName, origin, transactionData } =
    presentationRequest

  let entries: PresentationSubmissionEntry[] = []

  if (credentialsForRequest) {
    entries = await mapDifPexCredentialsForRequest(credentialsForRequest, agent)
  } else if (queryResult) {
    entries = await mapDcqlQueryResult(queryResult, agent)
  } else {
    throw new Error('No presentation exchange or dcql found in presentation request.')
  }

  return {
    type: PresentationSubmissionType.OpenId4VP,
    name: credentialsForRequest?.name ?? 'Unknown',
    areAllSatisfied: entries.every((entry) => entry.isSatisfied),
    purpose: credentialsForRequest?.purpose,
    submissionParams: {
      credentialsForRequest,
      queryResult,
      authorizationRequest,
      origin,
      transactionData,
    },
    verifierName: verifierHostName,
    entries,
  }
}

export async function mapDifPexCredentialsForRequest(
  credentialsForRequest: DifPexCredentialsForRequest,
  agent: HekaWalletAgent
): Promise<PresentationSubmissionEntry[]> {
  const entries: PresentationSubmissionEntry[] = []

  for (const requirement of credentialsForRequest.requirements) {
    const requirementEntries = await Promise.all(
      requirement.submissionEntry.map((entry) => formatDifPexSubmissionEntry(entry, agent))
    )
    entries.push(...requirementEntries)
  }

  return entries
}

export async function mapDcqlQueryResult(
  dcqlQueryResult: DcqlQueryResult,
  agent: HekaWalletAgent
): Promise<PresentationSubmissionEntry[]> {
  const credentialSets: NonNullable<DcqlQueryResult['credential_sets']> = dcqlQueryResult.credential_sets ?? [
    // If no credential sets are defined we create a default one with just all the credential options
    {
      required: true,
      options: [dcqlQueryResult.credentials.map((c) => c.id)],
      matching_options: dcqlQueryResult.can_be_satisfied ? [dcqlQueryResult.credentials.map((c) => c.id)] : undefined,
    },
  ]

  const entries: PresentationSubmissionEntry[] = []

  for (const credentialSet of credentialSets) {
    // Take first matching option, otherwise take first option
    const credentialSetOptions = credentialSet.matching_options?.[0] ?? credentialSet.options[0]
    for (const credentialId of credentialSetOptions) {
      const match = dcqlQueryResult.credential_matches[credentialId]
      const queryCredential = dcqlQueryResult.credentials.find((c) => c.id === credentialId)
      if (!queryCredential) {
        throw new Error(`Credential '${credentialId}' not found in dcql query`)
      }

      if (!match?.success) {
        entries.push({
          isSatisfied: false,
          inputDescriptorId: credentialId,
          name: tryExtractPlaceholderNameFromQueryCredential(queryCredential) ?? 'Unknown',
          submissionOptions: [],
          selectedOption: null,
        })
        continue
      }

      const matchSubmissionEntry = await formatDcqlQueryMatch(match, agent)

      entries.push(matchSubmissionEntry)
    }
  }

  return entries
}

async function formatDifPexSubmissionEntry(
  submissionEntry: DifPexCredentialsForRequestSubmissionEntry,
  agent: HekaWalletAgent
): Promise<PresentationSubmissionEntry> {
  const submissionOptions = await Promise.all(
    submissionEntry.verifiableCredentials.map(async (verifiableCredential) => {
      const credential = await mapCredentialRecord(verifiableCredential.credentialRecord, agent)

      // TODO: Nesting support
      let requestedAttributes: Attribute[]
      if (verifiableCredential.claimFormat === ClaimFormat.SdJwtDc) {
        requestedAttributes = getAttributesAndMetadataForSdJwtPayload(verifiableCredential.disclosedPayload).attributes
      } else if (verifiableCredential.claimFormat === ClaimFormat.MsoMdoc) {
        requestedAttributes = getAttributesAndMetadataForMdocPayload(
          verifiableCredential.disclosedPayload,
          verifiableCredential.credentialRecord.firstCredential
        ).attributes
      } else {
        requestedAttributes = credential.display.attributes as Attribute[]
      }

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

async function formatDcqlQueryMatch(
  match: DcqlMatchWithRecord & { success: true },
  agent: HekaWalletAgent
): Promise<PresentationSubmissionEntry> {
  const submissionOptions: CredentialSubmissionOption[] = []

  for (const validMatch of match.valid_credentials) {
    const credential = await mapCredentialRecord(validMatch.record, agent)
    let requestedAttributes: Attribute[]

    if (validMatch.record.type === 'SdJwtVcRecord') {
      // Credo already applied selective disclosure on payload
      const { attributes: sdJwtAttributes } = getAttributesAndMetadataForSdJwtPayload(
        validMatch.claims.valid_claim_sets[0].output
      )

      requestedAttributes = sdJwtAttributes
    } else if (validMatch.record.type === 'MdocRecord') {
      const namespaces = validMatch.claims.valid_claim_sets[0].output as MdocNameSpaces
      const { attributes: mdocAttributes } = getAttributesAndMetadataForMdocPayload(
        namespaces,
        validMatch.record.firstCredential
      )

      requestedAttributes = mdocAttributes
    } else {
      // All attributes are disclosed for W3C
      requestedAttributes = credential.display.attributes as Attribute[]
    }

    submissionOptions.push({
      credential,
      requestedAttributes,
    })
  }

  return {
    inputDescriptorId: match.credential_query_id,
    name: submissionOptions[0].credential.display.name,
    isSatisfied: true,
    selectedOption: submissionOptions[0],
    submissionOptions,
  }
}

function tryExtractPlaceholderNameFromQueryCredential(
  credential: DcqlQueryResult['credentials'][number]
): string | undefined {
  if (credential.format === 'mso_mdoc') {
    return credential.meta?.doctype_value
  }

  if (
    (credential.format === 'vc+sd-jwt' && credential.meta && 'vct_values' in credential.meta) ||
    credential.format === 'dc+sd-jwt'
  ) {
    return credential.meta && 'vct_values' in credential.meta
      ? credential.meta.vct_values?.[0].replace('https://', '')
      : undefined
  }
}

export async function mapAnoncredsProofExchangeRecord(
  proofExchangeRecord: DidCommProofExchangeRecord,
  agent: HekaWalletAgent
): Promise<AnoncredsPresentationSubmission> {
  const repository = agent.dependencyManager.resolve(DidCommCredentialExchangeRepository)
  const formatData = await agent.didcomm.proofs.getFormatData(proofExchangeRecord.id)

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
        requirement.submissionEntry.map((entry) => formatDifPexSubmissionEntry(entry, agent))
      )
      entriesArray.push(...requirementEntries)
    }
  } else {
    const proofRequest = formatData.request?.anoncreds ?? formatData.request?.indy

    const credentialsForRequest = await agent.didcomm.proofs.getCredentialsForRequest({
      proofExchangeRecordId: proofExchangeRecord.id,
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
          ? ((requestedValue as AnonCredsRequestedAttribute).names ?? [requestedValue.name as string])
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
    ? await agent.didcomm.connections.getById(proofExchangeRecord.connectionId)
    : null
  const outOfBandRecord = verifierConnection?.outOfBandId
    ? await agent.didcomm.oob.getById(verifierConnection.outOfBandId)
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
  record: DidCommProofExchangeRecord,
  agent: HekaWalletAgent,
  credentials: Credential[]
): Promise<Array<PresentationDetails>> {
  const formatData = await agent.didcomm.proofs.getFormatData(record.id)

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
