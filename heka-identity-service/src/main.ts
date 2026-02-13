import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { startApp } from './app.starter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  await startApp(app, { withSwaggerUi: true })
}

void bootstrap()
