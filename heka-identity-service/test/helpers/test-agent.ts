import { AnonCredsModule } from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  ConsoleLogger,
  DidsModule,
  JwkDidRegistrar,
  JwkDidResolver,
  KeyDidRegistrar,
  KeyDidResolver,
  LogLevel,
  PeerDidRegistrar,
  PeerDidResolver,
  WebDidResolver,
} from '@credo-ts/core'
import { DidCommModule } from '@credo-ts/didcomm'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrModule } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/node'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
import { NativeAnoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'
import { NativeAskar } from '@openwallet-foundation/askar-nodejs'

import { IndyBesuDidRegistrar, IndyBesuDidResolver, IndyBesuModule } from 'common/indy-besu-vdr'
import { IndyBesuAnonCredsRegistry } from 'common/indy-besu-vdr/anoncreds/IndyBesuAnonCredsRegistry'
import { IndyDidRegistrar, IndyDidResolver } from 'common/indy-vdr/indy-did'
import { TailsService } from 'revocation/revocation-registry/tails.service'
import { uuid } from 'src/utils/misc'
import AgentConfig from 'test/config/agent'

import { testDbHost, testDbPassword, testDbPort, testDbUser } from '../config/db'

function getTestModulesMap() {
  const rootWalletId = `test-root-${uuid()}`
  const rootWalletKey = uuid()

  return {
    askar: new AskarModule({
      askar: NativeAskar.instance,
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
    didcomm: new DidCommModule({
      messagePickup: true,
      connections: {
        autoAcceptConnections: true,
      },
      endpoints: ['http://localhost:3000', 'ws://localhost:3002'],
    }),
    openid4vc: new OpenId4VcModule(),
    // The did:indy resolver and the Indy AnonCreds registry read the ledger through it
    indyVdr: new IndyVdrModule({ indyVdr, networks: AgentConfig().networks }),
    indyBesu: new IndyBesuModule({
      chainId: 1337,
      nodeAddress: 'http://localhost:8545',
      endorserPrivateKey: AgentConfig().indyBesuEndorserPrivateKey,
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
    dids: new DidsModule({
      resolvers: [
        new KeyDidResolver(),
        new PeerDidResolver(),
        new JwkDidResolver(),
        new WebDidResolver(),
        new IndyDidResolver(),
        new IndyBesuDidResolver(),
        new HederaDidResolver(),
      ],
      registrars: [
        new KeyDidRegistrar(),
        new PeerDidRegistrar(),
        new JwkDidRegistrar(),
        new IndyDidRegistrar(),
        new IndyBesuDidRegistrar(),
        new HederaDidRegistrar(),
      ],
    }),
    anoncreds: new AnonCredsModule({
      registries: [new IndyVdrAnonCredsRegistry(), new IndyBesuAnonCredsRegistry(), new HederaAnonCredsRegistry()],
      anoncreds: NativeAnoncreds.instance,
      tailsFileService: new TailsService({
        corsOptions: {},
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
      autoUpdateStorageOnStartup: true,
      allowInsecureHttpUrls: true,
      logger: new ConsoleLogger(LogLevel.Error),
    },
    dependencies: agentDependencies,
    modules: getTestModulesMap(),
  })
}
