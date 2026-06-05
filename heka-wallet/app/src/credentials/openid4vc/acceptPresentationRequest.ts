import {
  ClaimFormat,
  CredentialMultiInstanceUseMode,
  DcqlCredentialsForRequest,
  DcqlQueryResult,
  JsonObject,
  MdocNameSpaces,
} from '@credo-ts/core'
import { Linking } from 'react-native'

import { HekaWalletAgent } from '../../utils/agent'
import { CredentialRecord, OpenIdPresentationSubmissionParams } from '../types'

export type AcceptPresentationRequestOptions = {
  submissionParams: OpenIdPresentationSubmissionParams
  selectedCredentials: { [inputDescriptorId: string]: string }
}

/**
 * Accepts (shares) an OpenID4VP presentation for an already-resolved request.
 */
export async function acceptPresentationRequest(
  agent: HekaWalletAgent,
  { submissionParams, selectedCredentials }: AcceptPresentationRequestOptions
) {
  if (!agent) {
    throw new Error('Credo agent is not initialized')
  }

  if (
    !submissionParams.credentialsForRequest?.areRequirementsSatisfied &&
    !submissionParams.queryResult?.can_be_satisfied
  ) {
    throw new Error('Requirements from proof request are not satisfied')
  }

  // Map all requirements and entries to a credential record. If a credential record for an
  // input descriptor has been provided in `selectedCredentials` we will use that. Otherwise
  // it will pick the first available credential.
  const presentationExchangeCredentials = submissionParams.credentialsForRequest
    ? Object.fromEntries(
        await Promise.all(
          submissionParams.credentialsForRequest.requirements.flatMap((requirement) =>
            requirement.submissionEntry.slice(0, requirement.needsCount).map(async (entry) => {
              const credentialId = selectedCredentials[entry.inputDescriptorId]
              const credential =
                entry.verifiableCredentials.find((vc) => vc.credentialRecord.id === credentialId) ??
                entry.verifiableCredentials[0]

              // NOTE: we don't support single-use credentials for PEX
              return [entry.inputDescriptorId, [credential]]
            })
          )
        )
      )
    : undefined

  const dcqlCredentials = submissionParams.queryResult
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(
            Object.keys(selectedCredentials).length > 0
              ? // FIXME: this method should take into account w3c credentials
                getSelectedCredentialsForDcqlRequest(submissionParams.queryResult, selectedCredentials)
              : agent.openid4vc.holder.selectCredentialsForDcqlRequest(submissionParams.queryResult, {
                  // FIXME: we currently allow re-sharing if we don't have new instances anymore
                  useMode: CredentialMultiInstanceUseMode.NewOrFirst,
                })
          )
        )
      )
    : undefined

  const result = await agent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest({
    authorizationRequestPayload: submissionParams.authorizationRequest,
    origin: submissionParams.origin,
    presentationExchange: presentationExchangeCredentials
      ? {
          credentials: presentationExchangeCredentials,
        }
      : undefined,
    dcql: dcqlCredentials
      ? {
          credentials: dcqlCredentials,
        }
      : undefined,
  })

  // If redirect_uri is provided, open it in the browser
  // Even if the response returned an error, the redirect URI must be opened
  if (result.redirectUri) {
    await Linking.openURL(result.redirectUri)
  }

  if (result.serverResponse && (result.serverResponse.status < 200 || result.serverResponse.status > 299)) {
    throw new Error(`Error while accepting authorization request. ${JSON.stringify(result.serverResponse?.body)}`)
  }

  return result
}

function getSelectedCredentialsForDcqlRequest(
  dcqlQueryResult: DcqlQueryResult,
  selectedCredentials: { [credentialQueryId: string]: string }
): DcqlCredentialsForRequest {
  if (!dcqlQueryResult.can_be_satisfied) {
    throw new Error('Cannot select the credentials for the dcql query presentation if the request cannot be satisfied')
  }

  const credentials: DcqlCredentialsForRequest = {}

  type WithRecord<T> = T & {
    record: CredentialRecord
  }

  for (const [credentialQueryId, credentialRecordId] of Object.entries(selectedCredentials)) {
    const matchesForCredentialQuery = dcqlQueryResult.credential_matches[credentialQueryId]
    if (matchesForCredentialQuery.success) {
      const validCredentialMatch = matchesForCredentialQuery.valid_credentials.find(
        (credential) => (credential as WithRecord<typeof credential>).record.id === credentialRecordId
      )

      if (!validCredentialMatch) {
        throw new Error(
          `Could not find credential record ${credentialRecordId} in valid credential matches for credentialQueryId ${credentialQueryId}`
        )
      }

      // TODO: Improve the typing once selection in Credo becomes easier
      const matchWithRecord = validCredentialMatch as typeof validCredentialMatch & {
        record: CredentialRecord
      }

      if (matchWithRecord.record.type === 'MdocRecord') {
        credentials[credentialQueryId] = [
          {
            claimFormat: ClaimFormat.MsoMdoc,
            credentialRecord: matchWithRecord.record,
            disclosedPayload: matchWithRecord.claims.valid_claim_sets[0].output as MdocNameSpaces,
            // FIXME: We currently allow re-sharing if we don't have new instances anymore
            useMode: CredentialMultiInstanceUseMode.NewOrFirst,
          },
        ]
      } else if (matchWithRecord.record.type === 'SdJwtVcRecord') {
        credentials[credentialQueryId] = [
          {
            claimFormat: ClaimFormat.SdJwtDc,
            credentialRecord: matchWithRecord.record,
            disclosedPayload: matchWithRecord.claims.valid_claim_sets[0].output as JsonObject,
            // FIXME: We currently allow re-sharing if we don't have new instances anymore
            useMode: CredentialMultiInstanceUseMode.NewOrFirst,
          },
        ]
      }
    }
  }

  return credentials
}
