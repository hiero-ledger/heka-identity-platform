import type { DidCreateResult } from '@credo-ts/core'

import { transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import { TypedArrayEncoder } from '@credo-ts/core'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidIndyRegistrar extends DidRegistrar {
  public static readonly method = 'indy'

  private readonly endorserSeed!: string
  private readonly endorserDid!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    super()
    this.endorserSeed = agencyConfig.indyEndorserSeed
    this.endorserDid = agencyConfig.indyEndorserDid
  }

  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    await this.importEndorserDid(tenantAgent)

    return await tenantAgent.dids.create({
      method: DidIndyRegistrar.method,
      options: {
        network: options.namespace,
        endorserMode: 'internal',
        endorserDid: this.endorserDid,
        controller: options.controller,
      },
      secret: {
        verificationMethod: {
          id: options.publicKeyId ?? 'key-1',
          type: 'Ed25519VerificationKey2020',
          publicKey: options.publicKey,
        },
      },
    })
  }

  private async importEndorserDid(tenantAgent: TenantAgent): Promise<void> {
    const { keyId } = await tenantAgent.kms.importKey({
      privateJwk: transformPrivateKeyToPrivateJwk({
        privateKey: TypedArrayEncoder.fromString(this.endorserSeed),
        type: {
          crv: 'Ed25519',
          kty: 'OKP',
        },
      }).privateJwk,
    })

    await tenantAgent.dids.import({
      did: this.endorserDid,
      overwrite: true,
      keys: [
        {
          kmsKeyId: keyId,
          didDocumentRelativeKeyId: '#verkey',
        },
      ],
    })
  }
}
