import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'

import { ThrottleExceptionFilter } from './core/filters/throttle-exception.filter'
import { MainModule } from './main.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(MainModule, {
    bufferLogs: true,
    bodyParser: true,
  })
  app.useGlobalFilters(new ThrottleExceptionFilter())
  await MainModule.bootstrap(app)
}

void bootstrap()
