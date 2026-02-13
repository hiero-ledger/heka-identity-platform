import { registerAs } from '@nestjs/config'

export default registerAs('health', () => ({
  memoryHeapThresholdMb: process.env.HEALTH_MEMORY_HEAP_THRESHOLD_MB
    ? parseInt(process.env.HEALTH_MEMORY_HEAP_THRESHOLD_MB, 10)
    : 2048,
  memoryRssThresholdMb: process.env.HEALTH_MEMORY_RSS_THRESHOLD_MB
    ? parseInt(process.env.HEALTH_MEMORY_RSS_THRESHOLD_MB, 10)
    : 2048,
}))
