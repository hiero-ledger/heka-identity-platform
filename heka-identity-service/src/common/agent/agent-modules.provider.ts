import type { AnonCredsRegistry } from '@credo-ts/anoncreds'
import type { MdocIssuerCaService, VerifierTrustAnchorService } from 'mdoc-issuer-ca'
import type { SdJwtVcIssuerService } from 'sdjwt-vc-issuer'

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
  JwkDidRegistrar,
  JwkDidResolver,
  KeyDidRegistrar,
  KeyDidResolver,
  PeerDidRegistrar,
  PeerDidResolver,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'
import {
  DidCommAutoAcceptCredential,
  DidCommAutoAcceptProof,
  DidCommCredentialV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommModule,
  DidCommProofV2Protocol,
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
import { NativeAnoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'
import { ConfigType } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { NativeAskar } from '@openwallet-foundation/askar-nodejs'

import AgentConfig from 'config/agent'
import AppConfig from 'config/express'
import { MDOC_ISSUER_CA_SERVICE, VERIFIER_TRUST_ANCHOR_SERVICE } from 'mdoc-issuer-ca/mdoc-issuer-ca.tokens'
import { SDJWT_VC_ISSUER_SERVICE } from 'sdjwt-vc-issuer/sdjwt-vc-issuer.tokens'
import { createCredentialRequestToCredentialMapper, CredentialMapperDependencies } from 'utils/oid4vc'

import { TailsService } from '../../revocation/revocation-registry/tails.service'
import { IndyBesuAnonCredsRegistry, IndyBesuDidRegistrar, IndyBesuDidResolver, IndyBesuModule } from '../indy-besu-vdr'

/**
 * Tenant services the credential mapper needs, resolved through `ModuleRef` at call time: this provider is
 * built before `MdocIssuerCaService` / `SdJwtVcIssuerService` exist (they depend on the agent), so direct
 * injection would be a cycle.
 */
export function buildCredentialMapperDependencies(moduleRef: ModuleRef): CredentialMapperDependencies {
  return {
    getMdocIssuerCertificate: (agentContext) =>
      moduleRef.get<MdocIssuerCaService>(MDOC_ISSUER_CA_SERVICE, { strict: false }).loadCurrentDsc(agentContext),
    getSdJwtVcIssuerCertificate: (agentContext) =>
      moduleRef
        .get<SdJwtVcIssuerService>(SDJWT_VC_ISSUER_SERVICE, { strict: false })
        .loadIssuerCertificateChain(agentContext),
  }
}

/**
 * Credo's X.509 module with the service's relying-party trust provider attached: when the service
 * verifies a presented credential, the trusted certificates come from {@link VerifierTrustAnchorService}
 * (tenant IACA registry, curated anchors, cached EU lists) instead of one static certificate. Resolved
 * lazily via ModuleRef at verification time for the same cycle reason as `buildCredentialMapperDependencies`.
 */
function buildX509Module(moduleRef: ModuleRef): X509Module {
  return new X509Module({
    getTrustedCertificatesForVerification: (agentContext, verificationContext) =>
      moduleRef
        .get<VerifierTrustAnchorService>(VERIFIER_TRUST_ANCHOR_SERVICE, { strict: false })
        .getTrustedCertificatesForVerification(agentContext, verificationContext),
  })
}

function getTenantModulesMap(
  appConfig: ConfigType<typeof AppConfig>,
  agencyConfig: ConfigType<typeof AgentConfig>,
  moduleRef: ModuleRef,
) {
  const credentialFormatService = new AnonCredsDidCommCredentialFormatService()
  const proofFormatService = new AnonCredsDidCommProofFormatService()
  const legacyIndyCredentialFormatService = new LegacyIndyDidCommCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyDidCommProofFormatService()
  const dataIntegrityCredentialFormatService = new DataIntegrityDidCommCredentialFormatService()
  const presentationExchangeProofFormatService = new DidCommDifPresentationExchangeProofFormatService()

  const didResolvers: DidResolver[] = [
    new KeyDidResolver(),
    new PeerDidResolver(),
    new JwkDidResolver(),
    new WebDidResolver(),
  ]
  const didRegistrars: DidRegistrar[] = [new KeyDidRegistrar(), new PeerDidRegistrar(), new JwkDidRegistrar()]
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
      messagePickup: true,
      connections: {
        autoAcceptConnections: true,
      },
      credentials: {
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
      },
      proofs: {
        autoAcceptProofs: DidCommAutoAcceptProof.ContentApproved,
        proofProtocols: [
          new DidCommProofV2Protocol({
            proofFormats: [legacyIndyProofFormatService, proofFormatService, presentationExchangeProofFormatService],
          }),
        ],
      },
    }),
    dids: new DidsModule({
      resolvers: didResolvers,
      registrars: didRegistrars,
    }),
    cache: new CacheModule({
      cache: new InMemoryLruCache({ limit: 100 }),
    }),
    anoncreds: new AnonCredsModule({
      // @ts-expect-error Credo-ts requires a non-empty tuple but registries
      // are populated conditionally from agent config at runtime.
      registries: anoncredsRegistries,
      anoncreds: NativeAnoncreds.instance,
      tailsFileService: new TailsService(appConfig),
    }),
    askar: new AskarModule({
      askar: NativeAskar.instance,
      store: agencyConfig.askarStoreConfig,
    }),
    openid4vc: new OpenId4VcModule({
      app: agencyConfig.oidConfig.app,
      issuer: {
        baseUrl: agencyConfig.oidConfig.issuanceEndpoint,
        credentialRequestToCredentialMapper: createCredentialRequestToCredentialMapper(
          buildCredentialMapperDependencies(moduleRef),
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
    x509: buildX509Module(moduleRef),
  }
}

export type TenantModulesMap = ReturnType<typeof getTenantModulesMap>

export function getAgencyModulesMap(
  appConfig: ConfigType<typeof AppConfig>,
  agencyConfig: ConfigType<typeof AgentConfig>,
  moduleRef: ModuleRef,
) {
  return {
    ...getTenantModulesMap(appConfig, agencyConfig, moduleRef),
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
    moduleRef: ModuleRef,
  ): AgencyModulesMap => getAgencyModulesMap(appConfig, agencyConfig, moduleRef),
  inject: [AppConfig.KEY, AgentConfig.KEY, ModuleRef],
}
