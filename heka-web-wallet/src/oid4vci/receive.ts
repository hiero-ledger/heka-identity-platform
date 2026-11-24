import {
  DidJwk,
  DidKey,
  DidRepository,
  Kms,
  SdJwtVcRecord,
  type Agent,
  type JwkDidCreateOptions,
  type KeyDidCreateOptions,
} from '@credo-ts/core'
import type {
  OpenId4VcCredentialHolderBinding,
  OpenId4VcHolderApi,
  OpenId4VciCredentialBindingOptions,
} from '@credo-ts/openid4vc'

import { getOrCreateAgent } from '../credo/lazy-agent'
import { RECEIVE_STATUS_KEY } from '../wallet/storage-keys'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import {
  OPENID4VC_CREDENTIAL_METADATA_KEY,
  readCredentialDisplay,
  readIssuerName,
  type OpenId4VcCredentialMetadata,
} from './credential-display'

export type ResolvedCredentialOffer = Awaited<ReturnType<OpenId4VcHolderApi['resolveCredentialOffer']>>

// ES256 first: P-256 works in WebCrypto in every Chrome this wallet supports, and it is what
// Heka's issuer has received so far. EdDSA covers issuers that accept only Ed25519 proofs.
const PROOF_SIGNATURE_ALGORITHMS = [Kms.KnownJwaSignatureAlgorithms.ES256, Kms.KnownJwaSignatureAlgorithms.EdDSA]

/** What a receive attempt created, so that a failed attempt can remove it again. */
interface ReceiptResources {
  keyIds: string[]
  dids: string[]
}

/**
 * Thrown by acceptCredentialOffer. `retryable` is false once the issuer has redeemed the offer's
 * pre-authorized code, which works only once: retrying that offer can only fail.
 */
export class CredentialReceiveError extends Error {
  public readonly retryable: boolean

  public constructor(cause: unknown, retryable: boolean) {
    super(cause instanceof Error ? cause.message : 'Credential receive failed', { cause })
    this.name = 'CredentialReceiveError'
    this.retryable = retryable
  }
}

/**
 * Creates a non-extractable holder key for the issuer's proof algorithm and binds the credential
 * to it as heka-wallet does (app/src/credentials/useOpenIdHandlers.ts), except that a plain JWK
 * comes first when the issuer accepts one, so no DID record is created for it. Otherwise
 * did:jwk, then did:key. The stored SdJwtVcRecord keeps the KMS key id either way, so the wallet
 * page does not keep a separate thumbprint map.
 */
export async function createHolderBinding(
  agent: Agent,
  options: Pick<
    OpenId4VciCredentialBindingOptions,
    'proofTypes' | 'supportsJwk' | 'supportsAllDidMethods' | 'supportedDidMethods'
  >,
  created: ReceiptResources,
): Promise<OpenId4VcCredentialHolderBinding> {
  const jwtProof = options.proofTypes.jwt
  if (!jwtProof || jwtProof.keyAttestationsRequired) {
    throw new Error('This issuer requires a key attestation. This browser wallet cannot produce one.')
  }
  const [algorithm] = jwtProof.supportedSignatureAlgorithms
  if (!algorithm) {
    throw new Error(
      `The issuer accepts none of the proof algorithms this wallet signs with (${PROOF_SIGNATURE_ALGORITHMS.join(', ')})`,
    )
  }
  const supported = options.supportedDidMethods
  const didMethod =
    options.supportsAllDidMethods || supported?.includes('did:jwk')
      ? 'jwk'
      : supported?.includes('did:key') || !supported
        ? 'key'
        : undefined
  if (!options.supportsJwk && !didMethod) {
    throw new Error(
      `The issuer binds credentials to ${supported?.join(', ')}. This wallet supports JWK, did:jwk and did:key.`,
    )
  }

  const key = await agent.kms.createKeyForSignatureAlgorithm({ backend: 'webcrypto-browser', algorithm })
  created.keyIds.push(key.keyId)
  if (options.supportsJwk || !didMethod) return { method: 'jwk', keys: [Kms.PublicJwk.fromPublicJwk(key.publicJwk)] }

  const result = await agent.dids.create<JwkDidCreateOptions | KeyDidCreateOptions>({
    method: didMethod,
    options: { keyId: key.keyId },
  })
  if (result.didState.state !== 'finished') throw new Error(`Could not create a did:${didMethod} for the holder key`)
  const did = result.didState.did
  created.dids.push(did)
  const didUrl =
    didMethod === 'jwk'
      ? DidJwk.fromDid(did).verificationMethodId
      : `${did}#${DidKey.fromDid(did).publicJwk.fingerprint}`
  return { method: 'did', didUrls: [didUrl] }
}

async function reportReceive(message: string): Promise<void> {
  await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'working', message } })
}

export async function resolveIncomingOffer(offerUri: string): Promise<ResolvedCredentialOffer> {
  await reportReceive('Reading the offer… Nothing is stored until you accept it.')
  const agent = await getOrCreateAgent()
  return agent.openid4vc.holder.resolveCredentialOffer(offerUri)
}

/** Kept on the record for the popup and wallet page, as heka-wallet does at receive. */
function credentialMetadata(offer: ResolvedCredentialOffer, configuration: unknown): OpenId4VcCredentialMetadata {
  const issuer = offer.metadata.credentialIssuer
  const name = readIssuerName(issuer)
  return {
    credential: readCredentialDisplay(configuration),
    issuer: name ? { id: issuer.credential_issuer, name } : { id: issuer.credential_issuer },
  }
}

export async function acceptCredentialOffer(
  resolvedCredentialOffer: ResolvedCredentialOffer,
  txCode?: string,
): Promise<{ received: number; deferred: number }> {
  await reportReceive('Requesting the credential… Keep this page open.')
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder
  const created: ReceiptResources = { keyIds: [], dids: [] }
  const storedRecordIds: string[] = []
  let codeRedeemed = false

  try {
    const tokenResponse = await holder.requestToken({
      resolvedCredentialOffer,
      ...(txCode ? { txCode } : {}),
    })
    codeRedeemed = true
    const { credentials, deferredCredentials } = await holder.requestCredentials({
      resolvedCredentialOffer,
      accessToken: tokenResponse.accessToken,
      cNonce: tokenResponse.cNonce,
      dpop: tokenResponse.dpop,
      allowedProofOfPossessionSignatureAlgorithms: PROOF_SIGNATURE_ALGORITHMS,
      credentialBindingResolver: (options: OpenId4VciCredentialBindingOptions) =>
        createHolderBinding(agent, options, created),
    })

    for (const credentialResponse of credentials) {
      if (!(credentialResponse.record instanceof SdJwtVcRecord)) {
        throw new Error(`Unsupported credential record type ${credentialResponse.record.type}`)
      }
      credentialResponse.record.metadata.set(
        OPENID4VC_CREDENTIAL_METADATA_KEY,
        credentialMetadata(resolvedCredentialOffer, credentialResponse.credentialConfiguration),
      )
      await agent.sdJwtVc.store({ record: credentialResponse.record })
      storedRecordIds.push(credentialResponse.record.id)
    }

    created.keyIds.length = 0
    created.dids.length = 0
    storedRecordIds.length = 0
    await reportReceive('Saving the credential…')
    await syncCredentialSummaryCache(agent)
    return { received: credentials.length, deferred: deferredCredentials.length }
  } catch (error) {
    await rollbackReceipt(agent, storedRecordIds, created)
    throw new CredentialReceiveError(error, !codeRedeemed)
  }
}

/** The result line for the holder. A deferred credential is not in the wallet yet. */
export function receiveResultMessage(received: number, deferred: number): string {
  const receivedText = `Received ${received} credential${received === 1 ? '' : 's'}.`
  if (deferred === 0) return receivedText
  const deferredText =
    `The issuer will issue ${deferred === 1 ? 'one credential' : `${deferred} credentials`} later. ` +
    'This wallet cannot collect deferred credentials yet; request a new offer from the issuer later.'
  return received === 0 ? deferredText : `${receivedText} ${deferredText}`
}

async function rollbackReceipt(agent: Agent, storedRecordIds: string[], created: ReceiptResources): Promise<void> {
  await Promise.all(
    storedRecordIds.map(async (id) => {
      try {
        await agent.sdJwtVc.deleteById(id)
      } catch {
        // Keep removing the rest of this attempt.
      }
    }),
  )
  await Promise.all(
    created.dids.map(async (did) => {
      try {
        const didRepository = agent.dependencyManager.resolve(DidRepository)
        for (const record of await agent.dids.getCreatedDids({ did })) await didRepository.delete(agent.context, record)
      } catch {
        // As below: the issuance error matters more.
      }
    }),
  )
  await Promise.all(
    created.keyIds.map(async (keyId) => {
      try {
        await agent.kms.deleteKey({ keyId, backend: 'webcrypto-browser' })
      } catch {
        // The issuance error is the one the holder needs to see.
      }
    }),
  )
}
