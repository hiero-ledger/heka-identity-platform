import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'

import { MainModule } from './main.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(MainModule, {
    bufferLogs: true,
    bodyParser: true,
  })
  void MainModule.bootstrap(app).catch()
}

void bootstrap()
