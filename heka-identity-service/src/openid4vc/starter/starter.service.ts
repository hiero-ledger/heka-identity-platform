import { Server } from 'http'

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

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
    this.server = agenctConfig.oidConfig.app.listen(agenctConfig.oidConfig.port)
  }
  public onApplicationShutdown(signal?: string) {
    this.server.close()
  }
}
