import { Kms, SdJwtVcRecord, type Agent } from '@credo-ts/core'
import type { OpenId4VciCredentialBindingOptions } from '@credo-ts/openid4vc'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import { RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

/**
 * Creates a non-extractable P-256 key and returns the JWK binding Credo
 * sends as the OID4VCI proof of possession. The stored SdJwtVcRecord keeps
 * the KMS key id, so the popup does not keep a separate thumbprint map.
 */
export async function createJwkHolderBinding(agent: Agent): Promise<{ method: 'jwk'; keys: Kms.PublicJwk[] }> {
  const createdKey = await agent.kms.createKey({
    backend: 'webcrypto-browser',
    type: { kty: 'EC', crv: 'P-256' },
  })
  return { method: 'jwk', keys: [Kms.PublicJwk.fromPublicJwk(createdKey.publicJwk)] }
}

async function reportReceive(message: string): Promise<void> {
  await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'working', message } })
}

export async function receiveCredentialOffer(offerUri: string) {
  await reportReceive('Starting the wallet… Keep this popup open.')
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder

  await reportReceive('Contacting the issuer… Keep this popup open.')
  const resolvedCredentialOffer = await holder.resolveCredentialOffer(offerUri)
  await reportReceive('Requesting the credential… Keep this popup open.')
  const tokenResponse = await holder.requestToken({ resolvedCredentialOffer })
  const { credentials } = await holder.requestCredentials({
    resolvedCredentialOffer,
    accessToken: tokenResponse.accessToken,
    cNonce: tokenResponse.cNonce,
    dpop: tokenResponse.dpop,
    allowedProofOfPossessionSignatureAlgorithms: ['ES256'],
    credentialBindingResolver: async (options: OpenId4VciCredentialBindingOptions) => {
      if (options.proofTypes.jwt?.keyAttestationsRequired) {
        throw new Error('This issuer requires a key attestation. This browser wallet cannot produce one.')
      }
      if (!options.supportsJwk) {
        throw new Error('Issuer does not support JWK binding')
      }
      return createJwkHolderBinding(agent)
    },
  })

  for (const credentialResponse of credentials) {
    if (!(credentialResponse.record instanceof SdJwtVcRecord)) {
      throw new Error(`Unsupported credential record type ${credentialResponse.record.type}`)
    }
    await agent.sdJwtVc.store({ record: credentialResponse.record })
  }

  await reportReceive('Saving the credential…')
  await syncCredentialSummaryCache(agent)
  return credentials
}
