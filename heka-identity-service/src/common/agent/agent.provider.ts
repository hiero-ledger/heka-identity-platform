import { Agent as CredoAgent, BaseAgent, Kms, LogLevel, X509ModuleConfig } from '@credo-ts/core'
import { DidCommHttpOutboundTransport, DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import { agentDependencies, DidCommHttpInboundTransport, DidCommWsInboundTransport } from '@credo-ts/node'
import { OnApplicationShutdown } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { Logger, LoggerProvider } from 'common/logger'
import AgentConfig from 'config/agent'

import { AgencyModulesMap, AGENT_MODULES_TOKEN, TenantModulesMap } from './agent-modules.provider'
import { CredoLogger } from './credo-logger'

export class Agent extends CredoAgent<AgencyModulesMap> implements OnApplicationShutdown {
  private readonly agencyLogger: Logger

  public constructor(
    public readonly agencyConfig: ConfigType<typeof AgentConfig>,
    agentModules: AgencyModulesMap,
    loggerProvider: LoggerProvider,
  ) {
    super({
      config: {
        ...agencyConfig.initConfig,
        logger: new CredoLogger(loggerProvider.getLogger().child('CredoFramework'), LogLevel.Trace),
      },
      dependencies: agentDependencies,
      modules: agentModules,
    })

    this.agencyLogger = loggerProvider.getLogger().child('Agent')
  }

  public async initialize() {
    const logger = this.agencyLogger.child('initialize')
    logger.trace('>')

    logger.info(`Agent config:\n${JSON.stringify(this.agencyConfig, undefined, 2)}`)

    this.modules.didcomm.registerOutboundTransport(new DidCommHttpOutboundTransport())
    if (this.agencyConfig.httpPort) {
      this.modules.didcomm.registerInboundTransport(
        new DidCommHttpInboundTransport({ port: this.agencyConfig.httpPort }),
      )
    }

    this.modules.didcomm.registerOutboundTransport(new DidCommWsOutboundTransport())
    if (this.agencyConfig.wsPort) {
      this.modules.didcomm.registerInboundTransport(new DidCommWsInboundTransport({ port: this.agencyConfig.wsPort }))
    }

    await super.initialize()

    if (this.agencyConfig.mdlIssuerCertificate) {
      const x509Config = this.context.resolve(X509ModuleConfig)
      x509Config.addTrustedCertificate(this.agencyConfig.mdlIssuerCertificate)
      logger.info('MDL issuer certificate added to trusted certificates')
    }

    if (this.agencyConfig.mdlIssuerPrivateKeyJwk) {
      const kms = this.context.resolve(Kms.KeyManagementApi)
      const mdlIssuerPrivateJwk = this.agencyConfig.mdlIssuerPrivateKeyJwk as unknown as Kms.KmsJwkPrivate

      // Re-importing a key that already exists makes Credo's AskarStoreManager
      // log "Error occurred during transaction, rollback" at ERROR level (askar
      // Duplicate) on every restart, so we're doing a pre-check.
      let existingMdlIssuerKey
      if (mdlIssuerPrivateJwk.kid) {
        try {
          existingMdlIssuerKey = await kms.getPublicKey({ keyId: mdlIssuerPrivateJwk.kid })
        } catch (error) {
          if (!(error instanceof Kms.KeyManagementKeyNotFoundError)) throw error
        }
      }

      if (existingMdlIssuerKey) {
        logger.debug('MDL issuer private key already present in KMS')
      } else {
        try {
          await kms.importKey({ privateJwk: mdlIssuerPrivateJwk })
          logger.info('MDL issuer private key imported into KMS')
        } catch (error) {
          // Safety check for concurrent startups or keys configured without a kid.
          const isDuplicateEntry = error instanceof Error && error.message === 'Duplicate entry'
          if (error instanceof Kms.KeyManagementKeyExistsError || isDuplicateEntry) {
            logger.debug('MDL issuer private key already present in KMS')
          } else {
            throw error
          }
        }
      }
    }

    logger.trace('<')
  }

  public async onApplicationShutdown(signal?: string) {
    await this.shutdown()
  }
}

export const AGENT_TOKEN = 'Agent'

export const agentProvider = {
  provide: AGENT_TOKEN,
  useFactory: async (
    agencyConfig: ConfigType<typeof AgentConfig>,
    agentModules: AgencyModulesMap,
    loggerProvider: LoggerProvider,
  ): Promise<Agent> => {
    const agent = new Agent(agencyConfig, agentModules, loggerProvider)
    await agent.initialize()
    return agent
  },
  inject: [AgentConfig.KEY, AGENT_MODULES_TOKEN, LoggerProvider],
}

export type TenantAgent = BaseAgent<TenantModulesMap>
