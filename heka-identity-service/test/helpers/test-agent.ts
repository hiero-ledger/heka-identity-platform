import { AnonCredsModule } from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import { Agent, ConsoleLogger, DidsModule, KeyDidRegistrar, KeyDidResolver, LogLevel } from '@credo-ts/core'
import { ConnectionsModule, DidCommModule, MessagePickupModule, OutOfBandModule } from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrIndyDidRegistrar, IndyVdrIndyDidResolver } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/node'
import { OpenId4VcHolderModule } from '@credo-ts/openid4vc'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { askar } from '@openwallet-foundation/askar-nodejs'

import { IndyBesuDidRegistrar, IndyBesuDidResolver, IndyBesuModule } from 'common/indy-besu-vdr'
import { IndyBesuAnonCredsRegistry } from 'common/indy-besu-vdr/anoncreds/IndyBesuAnonCredsRegistry'
import { TailsService } from 'revocation/revocation-registry/tails.service'
import { uuid } from 'src/utils/misc'
import AgentConfig from 'test/config/agent'

import { testDbHost, testDbPassword, testDbPort, testDbUser } from '../config/db'

function getTestModulesMap() {
  const rootWalletId = `test-root-${uuid()}`
  const rootWalletKey = uuid()

  return {
    askar: new AskarModule({
      askar,
      store: {
        id: rootWalletId,
        key: rootWalletKey,
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
    connections: new ConnectionsModule({
      autoAcceptConnections: true,
    }),
    didcomm: new DidCommModule({ endpoints: ['http://localhost:3000', 'ws://localhost:3002'] }),
    oob: new OutOfBandModule(),
    openId4VcHolder: new OpenId4VcHolderModule(),
    indyBesu: new IndyBesuModule({ chainId: 1337, nodeAddress: 'http://localhost:8545' }),
    hedera: new HederaModule({
      networks: [
        {
          network: AgentConfig().hederaNetwork,
          operatorId: AgentConfig().hederaOperatorId,
          operatorKey: AgentConfig().hederaOperatorKey,
        },
      ],
    }),
    dids: new DidsModule({
      resolvers: [
        new KeyDidResolver(),
        new IndyVdrIndyDidResolver(),
        new IndyBesuDidResolver(),
        new HederaDidResolver(),
        // new PeerDidResolver(),
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
      registries: [new IndyVdrAnonCredsRegistry(), new IndyBesuAnonCredsRegistry(), new HederaAnonCredsRegistry()],
      anoncreds,
      tailsFileService: new TailsService({
        corsOptions: undefined,
        enableCors: false,
        host: 'localhost',
        port: 8000,
        prefix: '',
        appEndpoint: 'http://localhost:8000',
      }),
    }),
  }
}

export type TestAgentModulesMap = ReturnType<typeof getTestModulesMap>

export function createAgent(): Agent<TestAgentModulesMap> {
  return new Agent({
    config: {
      label: 'Test Agent',
      autoUpdateStorageOnStartup: true,
      allowInsecureHttpUrls: true,
      logger: new ConsoleLogger(LogLevel.error),
    },
    dependencies: agentDependencies,
    modules: getTestModulesMap(),
  })
}
