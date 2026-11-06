import type { DidCreateResult, DidDeactivateResult, DidUpdateResult } from '@credo-ts/core'

import { transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { Kms, TypedArrayEncoder } from '@credo-ts/core'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { IndyDidChangeOptions, indyBaseDidDocument, VERKEY_FRAGMENT } from '../../indy-vdr/indy-did'
import { CreateDidOptions, DidRegistrar, UpdateDidOptions } from '../did-registrar.types'
import { updateBySettingDidDocument } from '../set-did-document-update'

export class DidIndyRegistrar extends DidRegistrar {
  public static readonly method = 'indy'

  // Credo's indy-vdr registrar always makes the DID its own controller and has no option for another one;
  // on Indy, authority over writes comes from the endorser instead. Tracked as a follow-up.
  public readonly supportsController = false

  // NYM transactions of the DID's own key (`IndyDidRegistrar`); the key `#verkey` never changes
  public readonly protectedKeyFragment = VERKEY_FRAGMENT

  private readonly endorserSeed!: string
  private readonly endorserDid!: string
  private readonly endorseDidChanges!: boolean

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    super()
    this.endorserSeed = agencyConfig.indyEndorserSeed
    this.endorserDid = agencyConfig.indyEndorserDid
    this.endorseDidChanges = agencyConfig.indyEndorseDidChanges
  }

  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    await ensureIndyEndorserDid(tenantAgent, this.endorserDid, this.endorserSeed)

    return await tenantAgent.dids.create({
      method: DidIndyRegistrar.method,
      options: {
        network: options.namespace,
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
      },
    })
  }

  /** One replacement of the document: the NYM's `diddocContent`. */
  public async updateDid(tenantAgent: TenantAgent, options: UpdateDidOptions): Promise<DidUpdateResult> {
    return await updateBySettingDidDocument(tenantAgent, options, await this.changeOptions(tenantAgent))
  }

  /** `DidService` does not send a second deactivation. */
  public async deactivateDid(tenantAgent: TenantAgent, did: string): Promise<DidDeactivateResult> {
    return await tenantAgent.dids.deactivate({ did, options: { ...(await this.changeOptions(tenantAgent)) } })
  }

  /** The endorser also signs updates and deactivations when `INDY_ENDORSE_DID_CHANGES` is set. */
  private async changeOptions(tenantAgent: TenantAgent): Promise<IndyDidChangeOptions> {
    if (!this.endorseDidChanges) return {}
    await ensureIndyEndorserDid(tenantAgent, this.endorserDid, this.endorserSeed)
    return { endorserDid: this.endorserDid }
  }
}

export async function ensureIndyEndorserDid(
  tenantAgent: TenantAgent,
  endorserDid: string,
  endorserSeed: string,
): Promise<void> {
  const [existing] = await tenantAgent.dids.getCreatedDids({ did: endorserDid })
  const keyId = existing?.keys?.find(
    ({ didDocumentRelativeKeyId }) => didDocumentRelativeKeyId === VERKEY_FRAGMENT,
  )?.kmsKeyId
  if (keyId && (await hasKey(tenantAgent, keyId))) {
    return
  }

  const { privateJwk } = transformPrivateKeyToPrivateJwk({
    privateKey: TypedArrayEncoder.fromUtf8String(endorserSeed),
    type: { kty: 'OKP', crv: 'Ed25519' },
  })
  const { keyId: importedKeyId } = await tenantAgent.kms.importKey({ privateJwk })

  // Built here rather than resolved from the ledger: only `#verkey` is used, to sign endorsements
  const verkey = TypedArrayEncoder.toBase58(TypedArrayEncoder.fromBase64Url(privateJwk.x))
  await tenantAgent.dids.import({
    did: endorserDid,
    didDocument: indyBaseDidDocument(endorserDid, verkey),
    overwrite: true,
    keys: [{ kmsKeyId: importedKeyId, didDocumentRelativeKeyId: VERKEY_FRAGMENT }],
  })
}

async function hasKey(tenantAgent: TenantAgent, keyId: string): Promise<boolean> {
  try {
    await tenantAgent.kms.getPublicKey({ keyId })
    return true
  } catch (error) {
    if (error instanceof Kms.KeyManagementKeyNotFoundError) return false
    throw error
  }
}
