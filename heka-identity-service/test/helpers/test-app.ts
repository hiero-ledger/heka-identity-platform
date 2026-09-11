import { AnonCredsModule } from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import {
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  WebDidResolver,
  JwkDidResolver,
  PeerDidResolver,
  PeerDidRegistrar,
  JwkDidRegistrar,
} from '@credo-ts/core'
import { DidCommMessagePickupModule } from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
} from '@credo-ts/indy-vdr'
import { NativeAnoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'
import { INestApplication } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { NativeAskar } from '@openwallet-foundation/askar-nodejs'

import { IndyBesuDidRegistrar, IndyBesuDidResolver } from 'common/indy-besu-vdr'
import { IndyBesuAnonCredsRegistry } from 'common/indy-besu-vdr/anoncreds/IndyBesuAnonCredsRegistry'
import AppConfig from 'config/express'
import { TailsService } from 'revocation/revocation-registry/tails.service'
import { AppModule } from 'src/app.module'
import { startApp } from 'src/app.starter'
import { AGENT_MODULES_TOKEN, getAgencyModulesMap } from 'src/common/agent/agent-modules.provider'
import AgentConfig from 'src/config/agent'
import FileStorageConfig from 'src/config/file-storage'
import MikroOrmConfig from 'src/config/mikro-orm'
import TestAgentConfig from 'test/config/agent'
import TestFileStorageConfig from 'test/config/file-storage'
import TestMikroOrmConfig from 'test/config/mikro-orm'
import { uuid } from 'utils/misc'

import { testDbHost, testDbPassword, testDbPort, testDbUser } from '../config/db'

export async function startTestApp(): Promise<INestApplication> {
  process.env.PINO_LEVEL = 'error'

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MikroOrmConfig.KEY)
    .useFactory({
      factory: TestMikroOrmConfig,
    })
    .overrideProvider(AgentConfig.KEY)
    .useFactory({
      factory: TestAgentConfig,
    })
    .overrideProvider(FileStorageConfig.KEY)
    .useFactory({
      factory: TestFileStorageConfig,
    })
    .overrideProvider(AGENT_MODULES_TOKEN)
    .useFactory({
      factory: (
        appConfig: ConfigType<typeof AppConfig>,
        agencyConfig: ConfigType<typeof AgentConfig>,
        moduleRef: ModuleRef,
      ) => {
        // The production module map as-is — including the combined `openid4vc` module (issuer + verifier
        // on the shared Express app, exact production mapper wiring). Do not add the standalone
        // `OpenId4VcIssuerModule` / `OpenId4VcVerifierModule` next to it: Credo initialises every module in
        // the map, so a second issuer module registers every OID4VCI route twice on the same Express app and
        // each request is then handled twice (`ERR_HTTP_HEADERS_SENT` noise, sessions flipped to `Error`).
        return {
          ...getAgencyModulesMap(appConfig, agencyConfig, moduleRef),
          askar: new AskarModule({
            askar: NativeAskar.instance,
            store: {
              id: `tenant-${uuid()}`,
              key: `tenant-${uuid()}`,
              database: {
                type: 'postgres',
                config: {
                  host: `${testDbHost}:${testDbPort}`,
                },
                credentials: {
                  account: testDbUser,
                  password: testDbPassword,
                },
              },
            },
          }),
          dids: new DidsModule({
            resolvers: [
              new KeyDidResolver(),
              new PeerDidResolver(),
              new JwkDidResolver(),
              new WebDidResolver(),
              new IndyVdrIndyDidResolver(),
              new IndyBesuDidResolver(),
              new HederaDidResolver(),
            ],
            registrars: [
              new KeyDidRegistrar(),
              new PeerDidRegistrar(),
              new JwkDidRegistrar(),
              new IndyVdrIndyDidRegistrar(),
              new IndyBesuDidRegistrar(),
              new HederaDidRegistrar(),
            ],
          }),
          messagePickup: new DidCommMessagePickupModule(),
          anoncreds: new AnonCredsModule({
            //registries: [new TestDsrAnonCredsRegistry()],
            registries: [
              new IndyVdrAnonCredsRegistry(),
              new IndyBesuAnonCredsRegistry(),
              new HederaAnonCredsRegistry(),
            ],
            anoncreds: NativeAnoncreds.instance,
            tailsFileService: new TailsService(appConfig),
          }),
          ledgerSdk: new IndyVdrModule({
            indyVdr,
            networks: agencyConfig.networks,
          }),
          hedera: new HederaModule({
            networks: [
              {
                network: AgentConfig().hederaNetwork,
                operatorId: AgentConfig().hederaOperatorId,
                operatorKey: AgentConfig().hederaOperatorKey,
              },
            ],
          }),
        }
      },
      inject: [AppConfig.KEY, AgentConfig.KEY, ModuleRef],
    })
    .compile()
  const app = moduleRef.createNestApplication({ bufferLogs: true })

  await startApp(app)

  return app
}
