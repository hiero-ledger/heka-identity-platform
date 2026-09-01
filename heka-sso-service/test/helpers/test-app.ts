import { MikroORM } from '@mikro-orm/core'
import { Global, INestApplication, Module, OnModuleInit } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'

import { MainModule } from '../../src/main.module'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql'
import { DatabaseModule, OidcEntity, OidcSigningKey } from '../../src/core/database'
import TestMikroOrmConfig from '../config/mikro-orm'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'

@Global()
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      imports: [],
      inject: [],
      useFactory: () =>
        defineConfig({
          ...TestMikroOrmConfig(),
          entities: [OidcEntity, OidcSigningKey],
          metadataProvider: ReflectMetadataProvider,
        }),
    }),
  ],
  providers: [],
})
export class TestDatabaseModule implements OnModuleInit {
  public constructor(private readonly orm: MikroORM) {}

  public async onModuleInit(): Promise<void> {
    await this.orm.connect()
  }
}

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
