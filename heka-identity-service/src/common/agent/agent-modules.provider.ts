import type { AnonCredsRegistry } from '@credo-ts/anoncreds'

import {
  AnonCredsCredentialFormatService,
  AnonCredsModule,
  AnonCredsProofFormatService,
  DataIntegrityCredentialFormatService,
  LegacyIndyCredentialFormatService,
  LegacyIndyProofFormatService,
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
  AutoAcceptCredential,
  AutoAcceptProof,
  DidCommModule,
  DifPresentationExchangeProofFormatService,
  V2CredentialProtocol,
  V2ProofProtocol,
  ConnectionsModule,
  CredentialsModule,
  ProofsModule,
  OutOfBandModule,
} from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
} from '@credo-ts/indy-vdr'
import { OpenId4VcIssuerModule, OpenId4VcVerifierModule } from '@credo-ts/openid4vc'
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
  const credentialFormatService = new AnonCredsCredentialFormatService()
  const proofFormatService = new AnonCredsProofFormatService()
  const legacyIndyCredentialFormatService = new LegacyIndyCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyProofFormatService()
  const dataIntegrityCredentialFormatService = new DataIntegrityCredentialFormatService()
  const presentationExchangeProofFormatService = new DifPresentationExchangeProofFormatService()

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
    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),
    credentials: new CredentialsModule({
      autoAcceptCredentials: AutoAcceptCredential.ContentApproved,
      credentialProtocols: [
        new V2CredentialProtocol({
          credentialFormats: [
            credentialFormatService,
            legacyIndyCredentialFormatService,
            dataIntegrityCredentialFormatService,
            // new JsonLdCredentialFormatService()
          ],
        }),
      ],
    }),
    proofs: new ProofsModule({
      autoAcceptProofs: AutoAcceptProof.ContentApproved,
      proofProtocols: [
        new V2ProofProtocol({
          proofFormats: [legacyIndyProofFormatService, proofFormatService, presentationExchangeProofFormatService],
        }),
      ],
    }),
    oob: new OutOfBandModule(),
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
    openId4VcIssuer: new OpenId4VcIssuerModule({
      baseUrl: agencyConfig.oidConfig.issuanceEndpoint,
      credentialRequestToCredentialMapper: createCredentialRequestToCredentialMapper(agencyConfig.mdlIssuerCertificate),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router: agencyConfig.oidConfig.app as any,
    }),
    openId4VcVerifier: new OpenId4VcVerifierModule({
      baseUrl: agencyConfig.oidConfig.verificationEndpoint,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router: agencyConfig.oidConfig.app as any,
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
