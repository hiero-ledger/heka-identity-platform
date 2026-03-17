import type { AnonCredsRegistry } from '@credo-ts/anoncreds'

import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsModule,
  AnonCredsDidCommProofFormatService,
  DataIntegrityDidCommCredentialFormatService,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
} from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import {
  CacheModule,
  DidRegistrar,
  DidResolver,
  DidsModule,
  InMemoryLruCache,
  KeyDidRegistrar,
  KeyDidResolver,
} from '@credo-ts/core'
import {
  DidCommAutoAcceptCredential,
  DidCommAutoAcceptProof,
  DidCommConnectionsModule,
  DidCommCredentialV2Protocol,
  DidCommCredentialsModule,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommModule,
  DidCommOutOfBandModule,
  DidCommProofV2Protocol,
  DidCommProofsModule,
} from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
} from '@credo-ts/indy-vdr'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
import { TenantsModule } from '@credo-ts/tenants'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'
import { ConfigType } from '@nestjs/config'
import { askar } from '@openwallet-foundation/askar-nodejs'

import AgentConfig from 'config/agent'
import AppConfig from 'config/express'
import { createCredentialRequestToCredentialMapper } from 'utils/oid4vc'

import { TailsService } from '../../revocation/revocation-registry/tails.service'
import { IndyBesuAnonCredsRegistry, IndyBesuDidRegistrar, IndyBesuDidResolver, IndyBesuModule } from '../indy-besu-vdr'

function getTenantModulesMap(appConfig: ConfigType<typeof AppConfig>, agencyConfig: ConfigType<typeof AgentConfig>) {
  const credentialFormatService = new AnonCredsDidCommCredentialFormatService()
  const proofFormatService = new AnonCredsDidCommProofFormatService()
  const legacyIndyCredentialFormatService = new LegacyIndyDidCommCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyDidCommProofFormatService()
  const dataIntegrityCredentialFormatService = new DataIntegrityDidCommCredentialFormatService()
  const presentationExchangeProofFormatService = new DidCommDifPresentationExchangeProofFormatService()

  const didResolvers: DidResolver[] = [new KeyDidResolver()]
  const didRegistrars: DidRegistrar[] = [new KeyDidRegistrar()]
  const anoncredsRegistries: AnonCredsRegistry[] = []

  if (agencyConfig.didMethods.includes('indy')) {
    didResolvers.push(new IndyVdrIndyDidResolver())
    didRegistrars.push(new IndyVdrIndyDidRegistrar())
    anoncredsRegistries.push(new IndyVdrAnonCredsRegistry())
  }
  if (agencyConfig.didMethods.includes('indybesu')) {
    didResolvers.push(new IndyBesuDidResolver())
    didRegistrars.push(new IndyBesuDidRegistrar())
    anoncredsRegistries.push(new IndyBesuAnonCredsRegistry())
  }
  if (agencyConfig.didMethods.includes('hedera')) {
    didResolvers.push(new HederaDidResolver())
    didRegistrars.push(new HederaDidRegistrar())
    anoncredsRegistries.push(new HederaAnonCredsRegistry())
  }

  return {
    didcomm: new DidCommModule({
      ...agencyConfig.didCommConfig,
    }),
    connections: new DidCommConnectionsModule({
      autoAcceptConnections: true,
    }),
    credentials: new DidCommCredentialsModule({
      autoAcceptCredentials: DidCommAutoAcceptCredential.ContentApproved,
      credentialProtocols: [
        new DidCommCredentialV2Protocol({
          credentialFormats: [
            credentialFormatService,
            legacyIndyCredentialFormatService,
            dataIntegrityCredentialFormatService,
            // new JsonLdCredentialFormatService()
          ],
        }),
      ],
    }),
    proofs: new DidCommProofsModule({
      autoAcceptProofs: DidCommAutoAcceptProof.ContentApproved,
      proofProtocols: [
        new DidCommProofV2Protocol({
          proofFormats: [legacyIndyProofFormatService, proofFormatService, presentationExchangeProofFormatService],
        }),
      ],
    }),
    oob: new DidCommOutOfBandModule(),
    dids: new DidsModule({
      resolvers: didResolvers,
      registrars: didRegistrars,
    }),
    cache: new CacheModule({
      cache: new InMemoryLruCache({ limit: 100 }),
    }),
    anoncreds: new AnonCredsModule({
      // @ts-ignore
      registries: anoncredsRegistries,
      anoncreds,
      tailsFileService: new TailsService(appConfig),
    }),
    askar: new AskarModule({
      askar,
      store: agencyConfig.askarStoreConfig,
    }),
    openId4Vc: new OpenId4VcModule({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app: agencyConfig.oidConfig.app as any,
      issuer: {
        baseUrl: agencyConfig.oidConfig.issuanceEndpoint,
        credentialRequestToCredentialMapper: createCredentialRequestToCredentialMapper(
          agencyConfig.mdlIssuerCertificate,
          agencyConfig.mdlIssuerPrivateKeyJwk,
        ),
      },
      verifier: {
        baseUrl: agencyConfig.oidConfig.verificationEndpoint,
      },
    }),
    ledgerSdk: new IndyVdrModule({
      indyVdr,
      networks: agencyConfig.networks,
    }),
    indyBesu: new IndyBesuModule({
      chainId: agencyConfig.indyBesuChainId,
      nodeAddress: agencyConfig.indyBesuNodeAddress,
    }),
    hedera: new HederaModule({
      networks: [
        {
          network: agencyConfig.hederaNetwork,
          operatorId: agencyConfig.hederaOperatorId,
          operatorKey: agencyConfig.hederaOperatorKey,
        },
      ],
    }),
  }
}

export type TenantModulesMap = ReturnType<typeof getTenantModulesMap>

export function getAgencyModulesMap(
  appConfig: ConfigType<typeof AppConfig>,
  agencyConfig: ConfigType<typeof AgentConfig>,
) {
  return {
    ...getTenantModulesMap(appConfig, agencyConfig),
    tenants: new TenantsModule<TenantModulesMap>(),
  }
}

export type AgencyModulesMap = ReturnType<typeof getAgencyModulesMap>

export const AGENT_MODULES_TOKEN = 'AgentModules'

export const agentModulesProvider = {
  provide: AGENT_MODULES_TOKEN,
  useFactory: (
    appConfig: ConfigType<typeof AppConfig>,
    agencyConfig: ConfigType<typeof AgentConfig>,
  ): AgencyModulesMap => getAgencyModulesMap(appConfig, agencyConfig),
  inject: [AppConfig.KEY, AgentConfig.KEY],
}
