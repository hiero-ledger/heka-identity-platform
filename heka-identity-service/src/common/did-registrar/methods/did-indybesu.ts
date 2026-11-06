import type { DidCreateResult, DidDeactivateResult, DidUpdateResult } from '@credo-ts/core'

import { UnprocessableEntityException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { IndyBesuDidCreateOptions } from '../../indy-besu-vdr'
import { CreateDidOptions, DidRegistrar, UpdateDidOptions } from '../did-registrar.types'
import { updateBySettingDidDocument } from '../set-did-document-update'

// The service types the Indy-Besu VDR accepts in a DID document
export const INDY_BESU_SERVICE_TYPES = ['LinkedDomains', 'DIDCommMessaging', 'CredentialRegistry', 'OID4VCI', 'OID4VP']

export class DidIndyBesuRegistrar implements DidRegistrar {
  public static readonly method = 'indybesu'

  // The Indy Besu DID contract (IndyDidRegistry) makes the DID its own owner (`owner = identity`) and requires the
  // endorsing signature to come from that identity, so a DID cannot have another controller.
  public readonly supportsController = false

  // Sent by the DID's own account; the owner key `#KEY-1` (the DID's address) never changes
  public readonly supportsUpdate = true
  public readonly supportsDeactivate = true
  public readonly protectedKeyFragment = '#KEY-1'

  private readonly network!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    this.network = agencyConfig.indyBesuNetwork
  }

  // The endorser is the platform account of IndyBesuModuleConfig, not a key of the tenant wallet
  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    return await tenantAgent.dids.create<IndyBesuDidCreateOptions>({
      method: DidIndyBesuRegistrar.method,
      options: {
        network: this.network,
      },
      secret: {},
    })
  }

  public async updateDid(tenantAgent: TenantAgent, options: UpdateDidOptions): Promise<DidUpdateResult> {
    const unsupportedType = options.addServices.find(({ type }) => !INDY_BESU_SERVICE_TYPES.includes(type))
    if (unsupportedType) {
      throw new UnprocessableEntityException(
        `did:indybesu supports service types: ${INDY_BESU_SERVICE_TYPES.join(', ')} (not '${unsupportedType.type}')`,
      )
    }

    return await updateBySettingDidDocument(tenantAgent, options)
  }

  /** `DidService` does not send a second deactivation: the ledger would reject it. */
  public deactivateDid(tenantAgent: TenantAgent, did: string): Promise<DidDeactivateResult> {
    return tenantAgent.dids.deactivate({ did })
  }
}
