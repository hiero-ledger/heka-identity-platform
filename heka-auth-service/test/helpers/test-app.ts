import { Global, INestApplication, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'

import { MainModule } from '../../src/main.module'
import { User, Token } from '../../src/core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig } from '@mikro-orm/sqlite'
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
    .compile()

  const app = moduleRef.createNestApplication({ bufferLogs: true })
  await MainModule.bootstrap(app)

  return app
}
