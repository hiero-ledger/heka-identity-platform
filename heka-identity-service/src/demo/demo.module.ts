import { Module } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'

import DemoConfig from 'config/demo'

import { DemoTokenProvider } from './demo-token.provider'
import { DemoController } from './demo.controller'

const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Optional demo-token broker (`GET /demo/token`), enabled by `DEMO_TOKEN_URL`, `DEMO_CLIENT_ID`
 * and `DEMO_CLIENT_SECRET`. The throttler is scoped to this module: only the broker endpoint
 * is rate-limited, the rest of the API is untouched.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [DemoConfig.KEY],
      useFactory: (config: ConfigType<typeof DemoConfig>) => ({
        throttlers: [{ name: 'demo-token', ttl: RATE_LIMIT_WINDOW_MS, limit: config.rateLimit }],
      }),
    }),
  ],
  controllers: [DemoController],
  providers: [DemoTokenProvider],
})
export class DemoModule {}
