import type { DidCreateResult } from '@credo-ts/core/build/modules/dids/types'

import { PublicJwk } from '@credo-ts/core/build/modules/kms'
import { ConfigType } from '@nestjs/config'

import AgentConfig from '../../../config/agent'
import { TenantAgent } from '../../agent'
import { IndyBesuDidCreateOptions } from '../../indy-besu-vdr'
import { CreateDidOptions, DidRegistrar } from '../did-registrar.types'

export class DidIndyBesuRegistrar implements DidRegistrar {
  public static readonly method = 'indybesu'

  private readonly network!: string
  // private readonly endorserPrivateKey!: string
  // private readonly endorserPublicKey!: string

  public constructor(agencyConfig: ConfigType<typeof AgentConfig>) {
    this.network = agencyConfig.indyBesuNetwork
    // this.endorserPrivateKey = agencyConfig.indyBesuEndorserPrivateKey
    // this.endorserPublicKey = agencyConfig.indyBesuEndorserPublicKey
  }

  public async createDid(tenantAgent: TenantAgent, options: CreateDidOptions): Promise<DidCreateResult> {
    const endorserKeyId = await this.importEndorserDid(tenantAgent)

    return await tenantAgent.dids.create<IndyBesuDidCreateOptions>({
      method: DidIndyBesuRegistrar.method,
      options: {
        network: this.network,
        endorserKeyId,
      },
      secret: {},
    })
  }

  private async importEndorserDid(tenantAgent: TenantAgent): Promise<string> {
    // try {
    const key = await tenantAgent.kms.createKey({
      type: {
        kty: 'OKP',
        crv: 'Ed25519',
      },
    })
    const publickJwk = PublicJwk.fromPublicJwk(key.publicJwk)
    return publickJwk.publicKey.publicKey
    // } catch (error) {
    //   if (error instanceof WalletKeyExistsError) {
    //     return new Key(TypedArrayEncoder.fromHex(this.endorserPublicKey), KeyType.K256)
    //   } else {
    //     throw error
    //   }
    // }
  }
}
