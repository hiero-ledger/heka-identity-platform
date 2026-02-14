import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { HealthCheck, HealthCheckResult, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus'

import { InjectLogger, Logger } from 'common/logger'
import HealthConfig from 'config/health'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  public constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly memoryHealthIndicator: MemoryHealthIndicator,
    @InjectLogger(HealthController)
    private readonly logger: Logger,
    @Inject(HealthConfig.KEY)
    private readonly healthConfig: ConfigType<typeof HealthConfig>,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Check app health' })
  @Get()
  @HealthCheck()
  public async check(): Promise<HealthCheckResult> {
    const logger = this.logger.child('check')

    const { memoryHeapThresholdMb, memoryRssThresholdMb } = this.healthConfig

    const checkResult = await this.healthCheckService.check([
      () => this.memoryHealthIndicator.checkHeap('memory_heap', memoryHeapThresholdMb * 1024 * 1024),
      () => this.memoryHealthIndicator.checkRSS('memory_rss', memoryRssThresholdMb * 1024 * 1024),
    ])
    logger.traceObject({ checkResult })

    return checkResult
  }
}
