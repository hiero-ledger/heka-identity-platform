import { ConfigService } from '@config'
import { Controller, Get, Logger } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { HealthCheck, HealthCheckResult, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  public constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly memoryHealthIndicator: MemoryHealthIndicator,
    private readonly configService: ConfigService,
  ) {
    this.logger.verbose('constructor<>')
  }

  @ApiOperation({ summary: 'Check app health' })
  @Get()
  @HealthCheck()
  public async check(): Promise<HealthCheckResult> {
    this.logger.verbose('Start health check')
    const { memoryHeapThresholdMb, memoryRssThresholdMb } = this.configService.healthConfig

    return await this.healthCheckService.check([
      () => this.memoryHealthIndicator.checkHeap('memory_heap', memoryHeapThresholdMb * 1024 * 1024),
      () => this.memoryHealthIndicator.checkRSS('memory_rss', memoryRssThresholdMb * 1024 * 1024),
    ])
  }
}
