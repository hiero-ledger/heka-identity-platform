import type { DidCreateResult, DidDeactivateResult, DidDocumentKey, DidUpdateResult } from '@credo-ts/core'

import { transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { DidDocument, getEd25519VerificationKey2020, JsonTransformer, Kms, TypedArrayEncoder } from '@credo-ts/core'
import { UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { SigningKey } from 'ethers'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { IndyBesuDidCreateOptions, IndyBesuDidUpdateOptions, isNothingSubmitted } from '../../indy-besu-vdr'
import {
  CreateDidOptions,
  DidRegistrar,
  fragmentOf,
  UpdateDidOptions,
  VERIFICATION_PURPOSES,
  VERIFICATION_RELATIONSHIPS,
} from '../did-registrar.types'

// The service types the Indy-Besu VDR accepts in a DID document
export const INDY_BESU_SERVICE_TYPES = ['LinkedDomains', 'DIDCommMessaging', 'CredentialRegistry', 'OID4VCI', 'OID4VP']

const ED25519_2020_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1'

type DidDocumentJson = Record<string, unknown> & { '@context'?: string | string[] }
type RelationshipEntry = string | { id: string }

type IndyBesuEndorserConfig = Pick<
  ConfigType<typeof AgentConfig>,
  'indyBesuEndorserPrivateKey' | 'indyBesuEndorserPublicKey'
>

/**
 * Throws when the configured endorser public key is not the one of the private key. The message names the variables
 * only, never key material.
 */
export function assertIndyBesuEndorserKeyPair(agencyConfig: IndyBesuEndorserConfig): void {
  let derived: string
  try {
    derived = new SigningKey(`0x${agencyConfig.indyBesuEndorserPrivateKey}`).compressedPublicKey
  } catch {
    throw new Error('INDY_BESU_ENDORSER_PRIVATE_KEY is not a valid secp256k1 private key (hex)')
  }
  if (derived.slice(2).toLowerCase() !== agencyConfig.indyBesuEndorserPublicKey.replace(/^0x/, '').toLowerCase()) {
    throw new Error('INDY_BESU_ENDORSER_PUBLIC_KEY does not match INDY_BESU_ENDORSER_PRIVATE_KEY')
  }
}

/**
 * Imports the configured Indy-Besu endorser key into the tenant's KMS unless it is there, and returns its KMS key id.
 * The key id is the configured public key, the id the Indy-Besu AnonCreds registrar passes as `endorserKey`.
 */
export async function ensureIndyBesuEndorserKey(
  tenantAgent: TenantAgent,
  agencyConfig: IndyBesuEndorserConfig,
): Promise<string> {
  const keyId = agencyConfig.indyBesuEndorserPublicKey

  // Checked first, so the usual case does not run into a failed insert (and its rollback) in Askar
  try {
    await tenantAgent.kms.getPublicKey({ keyId })
    return keyId
  } catch (error) {
    if (!(error instanceof Kms.KeyManagementKeyNotFoundError)) {
      throw error
    }
  }

  const { privateJwk } = transformPrivateKeyToPrivateJwk({
    privateKey: TypedArrayEncoder.fromHex(agencyConfig.indyBesuEndorserPrivateKey),
    type: { kty: 'EC', crv: 'secp256k1' },
  })
  try {
    await tenantAgent.kms.importKey({ privateJwk: { ...privateJwk, kid: keyId } })
  } catch (error) {
    // Imported by a concurrent request in the meantime
    if (!(error instanceof Kms.KeyManagementKeyExistsError)) {
      throw error
    }
  }
  return keyId
}

export class DidIndyBesuRegistrar implements DidRegistrar {
  public static readonly method = 'indybesu'

  // The Indy-Besu registrar writes the DID as its own controller. Whether the ledger contract accepts another
  // controller is not verified yet. Tracked as a follow-up.
  public readonly supportsController = false

  // Sent by the DID's own account; the owner key `#KEY-1` (the DID's address) never changes
  public readonly supportsUpdate = true
  public readonly supportsDeactivate = true
  public readonly protectedKeyFragment = '#KEY-1'

  private readonly network!: string
  private readonly endorserConfig!: IndyBesuEndorserConfig

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    assertIndyBesuEndorserKeyPair(agencyConfig)
    this.network = agencyConfig.indyBesuNetwork
    this.endorserConfig = {
      indyBesuEndorserPrivateKey: agencyConfig.indyBesuEndorserPrivateKey,
      indyBesuEndorserPublicKey: agencyConfig.indyBesuEndorserPublicKey,
    }
  }

  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    const endorserKeyId = await ensureIndyBesuEndorserKey(tenantAgent, this.endorserConfig)

    return await tenantAgent.dids.create<IndyBesuDidCreateOptions>({
      method: DidIndyBesuRegistrar.method,
      options: {
        network: this.network,
        endorserKeyId,
      },
      secret: {},
    })
  }

  /**
   * Applies the operations to the current ledger document and writes the result as one replacement, in one
   * transaction. Ids are full DID URLs on Indy-Besu. New keys are Ed25519: authority on the ledger only comes from the
   * owner address, so a key of another type would gain nothing there.
   */
  public async updateDid(tenantAgent: TenantAgent, options: UpdateDidOptions): Promise<DidUpdateResult> {
    const { did, currentDidDocument } = options
    const unsupportedType = options.addServices.find(({ type }) => !INDY_BESU_SERVICE_TYPES.includes(type))
    if (unsupportedType) {
      throw new UnprocessableEntityException(
        `did:indybesu supports service types: ${INDY_BESU_SERVICE_TYPES.join(', ')} (not '${unsupportedType.type}')`,
      )
    }

    const createdKeys: DidDocumentKey[] = []
    // Set once the update is handed to the registrar: from then on a transaction may have been sent
    let submitting = false
    try {
      const json = JsonTransformer.toJSON(currentDidDocument) as DidDocumentJson
      const entryId = (entry: RelationshipEntry) => (typeof entry === 'string' ? entry : entry.id)
      const removedServices = new Set(options.removeServices)
      const removedKeys = new Set(options.removeVerificationMethods)

      json.service = [
        ...((json.service as Array<{ id: string }> | undefined) ?? []).filter(
          ({ id }) => !removedServices.has(fragmentOf(id)),
        ),
        ...options.addServices.map(({ id, type, serviceEndpoint }) => ({ id: `${did}${id}`, type, serviceEndpoint })),
      ]
      json.verificationMethod = ((json.verificationMethod as Array<{ id: string }> | undefined) ?? []).filter(
        ({ id }) => !removedKeys.has(fragmentOf(id)),
      )
      for (const relationship of VERIFICATION_RELATIONSHIPS) {
        json[relationship] = ((json[relationship] as RelationshipEntry[] | undefined) ?? []).filter(
          (entry) => !removedKeys.has(fragmentOf(entryId(entry))),
        )
      }

      for (const { id, purposes } of options.addVerificationMethods) {
        const { keyId, publicJwk } = await tenantAgent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
        createdKeys.push({ kmsKeyId: keyId, didDocumentRelativeKeyId: id })
        const verificationMethod = getEd25519VerificationKey2020({
          id: `${did}${id}`,
          controller: did,
          publicJwk: Kms.PublicJwk.fromPublicJwk(publicJwk),
        })
        // Appended, so the owner key stays first: signing picks the first verification method
        ;(json.verificationMethod as unknown[]).push(JsonTransformer.toJSON(verificationMethod))
        for (const purpose of VERIFICATION_PURPOSES.filter((purpose) => purposes.includes(purpose))) {
          ;(json[purpose] as RelationshipEntry[]).push(verificationMethod.id)
        }
      }

      if (options.addVerificationMethods.length) {
        const context = json['@context'] ?? []
        const contexts = Array.isArray(context) ? context : [context]
        if (!contexts.some((entry) => entry === ED25519_2020_CONTEXT)) {
          json['@context'] = [...contexts, ED25519_2020_CONTEXT]
        }
      }

      // `setDidDocument` is the ledger's own semantics here (unlike did:hedera)
      submitting = true
      const result = await tenantAgent.dids.update<IndyBesuDidUpdateOptions>({
        did,
        didDocumentOperation: 'setDidDocument',
        didDocument: JsonTransformer.fromJSON(json, DidDocument),
        secret: { keys: createdKeys },
      })
      if (result.didState.state !== 'finished') {
        await releaseKeys(tenantAgent, createdKeys, isNothingSubmitted(result))
      }
      return result
    } catch (error) {
      await releaseKeys(tenantAgent, createdKeys, !submitting)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: { state: 'failed', reason: `Unable to update DID: ${(error as Error).message}` },
      }
    }
  }

  /** `DidService` does not send a second deactivation: the ledger would reject it. */
  public deactivateDid(tenantAgent: TenantAgent, did: string): Promise<DidDeactivateResult> {
    return tenantAgent.dids.deactivate({ did })
  }
}

/**
 * The keys created for a failed update are deleted only when nothing was sent to the ledger. A transaction that was sent
 * but not confirmed (receipt error or timeout) may still be mined: had its keys been deleted, the document would hold
 * verification methods without a private key. Such keys stay in the KMS (an unused key is harmless); the registrar has
 * already mapped them into the DID record if the ledger showed the new document. A warning without key ids is logged.
 */
async function releaseKeys(tenantAgent: TenantAgent, keys: DidDocumentKey[], nothingSubmitted: boolean): Promise<void> {
  if (!keys.length) {
    return
  }
  if (!nothingSubmitted) {
    tenantAgent.config.logger.warn(
      `did:indybesu update failed after its transaction may have been sent; ${keys.length} new key(s) are kept in the wallet`,
    )
    return
  }
  for (const key of keys) {
    await tenantAgent.kms.deleteKey({ keyId: key.kmsKeyId }).catch(() => undefined)
  }
}
