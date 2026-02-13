import process from 'node:process'

import { IsInt, IsOptional, Min } from 'class-validator'

export class HealthConfig {
  @IsOptional()
  @IsInt()
  @Min(0)
  public memoryHeapThresholdMb!: number

  @IsOptional()
  @IsInt()
  @Min(0)
  public memoryRssThresholdMb!: number

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.memoryHeapThresholdMb = env.HEALTH_MEMORY_HEAP_THRESHOLD_MB
      ? parseInt(process.env.HEALTH_MEMORY_HEAP_THRESHOLD_MB!, 10)
      : 2048
    this.memoryRssThresholdMb = env.HEALTH_MEMORY_RSS_THRESHOLD_MB
      ? parseInt(process.env.HEALTH_MEMORY_RSS_THRESHOLD_MB!, 10)
      : 2048
  }
}
