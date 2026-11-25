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
import { reportOfferProgress } from '../wallet/pending-items'
import { syncCredentialSummaryCache } from '../wallet/summary-cache'
import {
  OPENID4VC_CREDENTIAL_METADATA_KEY,
  readCredentialDisplay,
  readIssuerName,
  type OpenId4VcCredentialMetadata,
} from './credential-display'

export type ResolvedCredentialOffer = Awaited<ReturnType<OpenId4VcHolderApi['resolveCredentialOffer']>>

// ES256 first: P-256 works in WebCrypto in every Chrome this wallet supports, and Heka's issuers
// accept it. EdDSA covers issuers that accept only Ed25519 proofs.
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

type BindingOptions = Pick<
  OpenId4VciCredentialBindingOptions,
  'proofTypes' | 'supportsJwk' | 'supportsAllDidMethods' | 'supportedDidMethods'
>

/** The key algorithm and, unless the credential is bound to a plain JWK, the DID method. Throws when unsupported. */
function planHolderBinding(options: BindingOptions): {
  algorithm: Kms.KnownJwaSignatureAlgorithm
  didMethod?: 'jwk' | 'key'
} {
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
  return options.supportsJwk || !didMethod ? { algorithm } : { algorithm, didMethod }
}

/**
 * Creates a non-extractable holder key for the issuer's proof algorithm and binds the credential
 * to it as heka-wallet does (app/src/credentials/useOpenIdHandlers.ts), except that a plain JWK
 * comes first when the issuer accepts one, so no DID record is created for it. Otherwise
 * did:jwk, then did:key.
 */
export async function createHolderBinding(
  agent: Agent,
  options: BindingOptions,
  created: ReceiptResources,
): Promise<OpenId4VcCredentialHolderBinding> {
  const { algorithm, didMethod } = planHolderBinding(options)
  const key = await agent.kms.createKeyForSignatureAlgorithm({ backend: 'webcrypto-browser', algorithm })
  created.keyIds.push(key.keyId)
  if (!didMethod) return { method: 'jwk', keys: [Kms.PublicJwk.fromPublicJwk(key.publicJwk)] }

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * The binding options Credo derives from a credential configuration when it requests the
 * credential (OpenId4VciHolderService.getProofOfPossessionRequirements in 0.7.4), so that an offer
 * this wallet cannot bind is refused before its code is redeemed.
 */
function bindingOptionsFor(configuration: unknown, draftVersion: unknown): BindingOptions {
  const config = asRecord(configuration)
  const proofTypesSupported =
    asRecord(config?.proof_types_supported) ?? (draftVersion === 'Draft11' ? { jwt: {} } : null)
  if (!proofTypesSupported) {
    throw new Error(
      'The issuer does not bind this credential to a key. This wallet receives key-bound credentials only.',
    )
  }
  const jwt = asRecord(proofTypesSupported.jwt)
  const algorithms = jwt?.proof_signing_alg_values_supported
  const methods = Array.isArray(config?.cryptographic_binding_methods_supported)
    ? config.cryptographic_binding_methods_supported.filter((method): method is string => typeof method === 'string')
    : undefined
  return {
    proofTypes: {
      jwt: jwt
        ? {
            supportedSignatureAlgorithms: Array.isArray(algorithms)
              ? PROOF_SIGNATURE_ALGORITHMS.filter((algorithm) => algorithms.includes(algorithm))
              : PROOF_SIGNATURE_ALGORITHMS,
            keyAttestationsRequired: jwt.key_attestations_required ? {} : undefined,
          }
        : undefined,
    } as BindingOptions['proofTypes'],
    supportsJwk: (methods?.includes('jwk') || methods?.includes('cose_key')) ?? false,
    supportsAllDidMethods: methods?.includes('did') ?? false,
    supportedDidMethods: methods?.filter((method) => method.startsWith('did:')),
  }
}

/** Throws the binding error of the first offered credential this wallet cannot bind. */
export function assertHolderCanBind(offer: ResolvedCredentialOffer): void {
  for (const configuration of Object.values(offer.offeredCredentialConfigurations)) {
    planHolderBinding(bindingOptionsFor(configuration, offer.metadata.originalDraftVersion))
  }
}

export async function resolveIncomingOffer(offerUri: string): Promise<ResolvedCredentialOffer> {
  await reportOfferProgress(offerUri, 'Reading the offer… Nothing is stored until you accept it.')
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

export interface ReceiveResult {
  received: number
  deferred: number
  /** The `iss` of the stored credentials. */
  signedBy: string[]
  /** False when the credentials were stored but the popup summary could not be rewritten. */
  summaryUpdated: boolean
}

export async function acceptCredentialOffer(
  offerUri: string,
  resolvedCredentialOffer: ResolvedCredentialOffer,
  txCode?: string,
): Promise<ReceiveResult> {
  await reportOfferProgress(offerUri, 'Requesting the credential… Keep this page open.')
  const agent = await getOrCreateAgent()
  const holder = agent.openid4vc.holder
  const created: ReceiptResources = { keyIds: [], dids: [] }
  const storedRecordIds: string[] = []
  let codeRedeemed = false
  let result: Omit<ReceiveResult, 'summaryUpdated'>

  try {
    assertHolderCanBind(resolvedCredentialOffer)
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

    const signedBy = new Set<string>()
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
      const { iss } = credentialResponse.record.firstCredential.payload
      if (typeof iss === 'string') signedBy.add(iss)
    }
    result = { received: credentials.length, deferred: deferredCredentials.length, signedBy: [...signedBy] }
  } catch (error) {
    await rollbackReceipt(agent, storedRecordIds, created)
    throw new CredentialReceiveError(error, !codeRedeemed)
  }

  // The credentials are stored: a failure from here on must not remove them.
  try {
    await reportOfferProgress(offerUri, 'Saving the credential…')
    await syncCredentialSummaryCache(agent)
    return { ...result, summaryUpdated: true }
  } catch {
    return { ...result, summaryUpdated: false }
  }
}

/** The result line for the holder. A deferred credential is not in the wallet yet. */
export function receiveResultMessage(received: number, deferred: number, summaryUpdated = true): string {
  if (!summaryUpdated) return 'The credential was stored, but the wallet summary could not be updated.'
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
