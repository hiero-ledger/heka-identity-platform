import { ConfigType } from '@nestjs/config'

import AgentConfig from 'config/agent'

/**
 * The non-secret part of the agent config that is logged at startup.
 *
 * This is an allow-list: a field reaches the log only when it is added here and in {@link summarizeAgentConfig}.
 * Never add seeds, private keys, the Askar store key or database credentials. Also leave out the Askar store id
 * and `AGENT_LABEL`: the store key is derived from the label (`${label}-wallet-key`), so either one reveals it.
 */
export interface AgentConfigSummary {
  httpPort: number
  wsPort: number
  httpEndpoint: string
  wsEndpoint: string
  autoAcceptMediationRequests: boolean
  oid4vc: { port: number; issuanceEndpoint: string; verificationEndpoint: string }
  didCommEndpoints: string[] | undefined
  didMethods: string[]
  indyNetworks: Array<{ indyNamespace: string; isProduction: boolean; connectOnStartup?: boolean }>
  indyEndorserDid: string
  indyBesu: { chainId: number; network: string; nodeAddress: string; endorserPublicKey: string }
  hedera: { network: string; operatorId: string }
  askarStore: { databaseType?: string; host?: string }
  mdlIssuer: { certificateConfigured: boolean; keyId?: string }
  credentialsConfiguration: Record<string, { credentials: string[]; networks: string[] }>
}

/** Builds the startup log summary field by field; the config is never spread into it. */
export function summarizeAgentConfig(config: ConfigType<typeof AgentConfig>): AgentConfigSummary {
  const database = config.askarStoreConfig.database

  return {
    httpPort: config.httpPort,
    wsPort: config.wsPort,
    httpEndpoint: config.httpEndpoint,
    wsEndpoint: config.wsEndpoint,
    autoAcceptMediationRequests: config.autoAcceptMediationRequests,
    oid4vc: {
      port: config.oidConfig.port,
      issuanceEndpoint: config.oidConfig.issuanceEndpoint,
      verificationEndpoint: config.oidConfig.verificationEndpoint,
    },
    didCommEndpoints: config.didCommConfig.endpoints,
    didMethods: config.didMethods,
    indyNetworks: config.networks.map(({ indyNamespace, isProduction, connectOnStartup }) => ({
      indyNamespace,
      isProduction,
      connectOnStartup,
    })),
    indyEndorserDid: config.indyEndorserDid,
    indyBesu: {
      chainId: config.indyBesuChainId,
      network: config.indyBesuNetwork,
      nodeAddress: urlOrigin(config.indyBesuNodeAddress),
      endorserPublicKey: config.indyBesuEndorserPublicKey,
    },
    hedera: {
      network: config.hederaNetwork,
      operatorId: config.hederaOperatorId,
    },
    askarStore: {
      databaseType: database?.type,
      host: database?.type === 'postgres' ? database.config.host : undefined,
    },
    mdlIssuer: {
      certificateConfigured: Boolean(config.mdlIssuerCertificate),
      keyId: config.mdlIssuerPrivateKeyJwk?.kid,
    },
    credentialsConfiguration: Object.fromEntries(
      Object.entries(config.credentialsConfiguration).map(([protocol, { credentials, networks }]) => [
        protocol,
        { credentials, networks },
      ]),
    ),
  }
}

// RPC providers often put API keys in the path or in the userinfo; the origin drops both.
function urlOrigin(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return '<invalid URL>'
  }
}
