import { AnonCredsModule } from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import { DidsModule, KeyDidRegistrar, KeyDidResolver } from '@credo-ts/core'
import { MessagePickupModule } from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
} from '@credo-ts/indy-vdr'
import { OpenId4VcIssuerModule, OpenId4VcVerifierModule } from '@credo-ts/openid4vc'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'
import { INestApplication } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { askar } from '@openwallet-foundation/askar-nodejs'

import { IndyBesuDidRegistrar, IndyBesuDidResolver } from 'common/indy-besu-vdr'
import { IndyBesuAnonCredsRegistry } from 'common/indy-besu-vdr/anoncreds/IndyBesuAnonCredsRegistry'
import AppConfig from 'config/express'
import { TailsService } from 'revocation/revocation-registry/tails.service'
import { AppModule } from 'src/app.module'
import { startApp } from 'src/app.starter'
import { AGENT_MODULES_TOKEN, getAgencyModulesMap } from 'src/common/agent/agent-modules.provider'
import AgentConfig from 'src/config/agent'
import MikroOrmConfig from 'src/config/mikro-orm'
import { credentialRequestToCredentialMapper } from 'src/utils/oid4vc'
import TestAgentConfig from 'test/config/agent'
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
    .overrideProvider(AGENT_MODULES_TOKEN)
    .useFactory({
      factory: (appConfig: ConfigType<typeof AppConfig>, agencyConfig: ConfigType<typeof AgentConfig>) => {
        return {
          ...getAgencyModulesMap(appConfig, agencyConfig),
          askar: new AskarModule({
            askar,
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
              new IndyVdrIndyDidResolver(),
              new IndyBesuDidResolver(),
              new HederaDidResolver(),
            ],
            registrars: [
              new KeyDidRegistrar(),
              new IndyVdrIndyDidRegistrar(),
              new IndyBesuDidRegistrar(),
              new HederaDidRegistrar(),
            ],
          }),
          messagePickup: new MessagePickupModule(),
          anoncreds: new AnonCredsModule({
            //registries: [new TestDsrAnonCredsRegistry()],
            registries: [
              new IndyVdrAnonCredsRegistry(),
              new IndyBesuAnonCredsRegistry(),
              new HederaAnonCredsRegistry(),
            ],
            anoncreds,
            tailsFileService: new TailsService(appConfig),
          }),
          ledgerSdk: new IndyVdrModule({
            indyVdr,
            networks: agencyConfig.networks,
          }),
          openId4VcIssuer: new OpenId4VcIssuerModule({
            baseUrl: agencyConfig.oidConfig.issuanceEndpoint,
            router: agencyConfig.oidConfig.issuanceRouter,
            credentialRequestToCredentialMapper,
          }),
          openId4VcVerifier: new OpenId4VcVerifierModule({
            baseUrl: agencyConfig.oidConfig.verificationEndpoint,
            router: agencyConfig.oidConfig.verificationRouter,
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
      inject: [AppConfig.KEY, AgentConfig.KEY],
    })
    .compile()
  const app = moduleRef.createNestApplication({ bufferLogs: true })

  await startApp(app)

  return app
}
