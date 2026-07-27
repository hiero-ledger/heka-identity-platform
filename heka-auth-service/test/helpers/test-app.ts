import { Global, INestApplication, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'

import { MainModule } from '../../src/main.module'
import { User, Token } from '../../src/core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig } from '@mikro-orm/postgresql'
import { DatabaseModule } from '../../src/core/database'
import TestMikroOrmConfig from '../config/mikro-orm'
import { ReflectMetadataProvider } from '@mikro-orm/core'

@Global()
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      imports: [],
      inject: [],
      useFactory: () =>
        defineConfig({
          ...TestMikroOrmConfig(),
          entities: [User, Token],
          metadataProvider: ReflectMetadataProvider,
        }),
    }),
  ],
  providers: [],
  exports: [MikroOrmModule],
})
export class TestDatabaseModule {}

export async function startTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [MainModule],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(APP_GUARD)
    .useValue({ canActivate: () => true })
    .compile()

  const app = moduleRef.createNestApplication({ bufferLogs: true })
  await MainModule.bootstrap(app)

  return app
}
