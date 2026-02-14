import { Server } from 'http'

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import express from 'express'

import { InjectLogger, Logger } from 'common/logger'
import AgentConfig from 'config/agent'

@Injectable()
export class OpenId4VcStarterService implements OnApplicationShutdown {
  private server: Server
  public constructor(
    @InjectLogger(OpenId4VcStarterService) private readonly logger: Logger,
    @Inject(AgentConfig.KEY) agenctConfig: ConfigType<typeof AgentConfig>,
  ) {
    this.logger.child('constructor').trace('<>')
    const expressApp = express()
    this.server = expressApp.listen(agenctConfig.oidConfig.port)
    expressApp.use('/oid4vci', agenctConfig.oidConfig.issuanceRouter)
    expressApp.use('/oid4vp', agenctConfig.oidConfig.verificationRouter)
  }
  public onApplicationShutdown(signal?: string) {
    this.server.close()
  }
}
