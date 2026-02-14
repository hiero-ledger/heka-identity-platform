import { Agent as CredoAgent, BaseAgent, LogLevel } from '@credo-ts/core'
import { HttpOutboundTransport, WsOutboundTransport } from '@credo-ts/didcomm'
import { agentDependencies, HttpInboundTransport, WsInboundTransport } from '@credo-ts/node'
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
        logger: new CredoLogger(loggerProvider.getLogger().child('CredoFramework'), LogLevel.trace),
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

    this.modules.didcomm.registerOutboundTransport(new HttpOutboundTransport())
    if (this.agencyConfig.httpPort) {
      this.modules.didcomm.registerInboundTransport(new HttpInboundTransport({ port: this.agencyConfig.httpPort }))
    }

    this.modules.didcomm.registerOutboundTransport(new WsOutboundTransport())
    if (this.agencyConfig.wsPort) {
      this.modules.didcomm.registerInboundTransport(new WsInboundTransport({ port: this.agencyConfig.wsPort }))
    }

    await super.initialize()

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
