import { AnonCredsModule } from '@credo-ts/anoncreds'
import {
  Agent,
  DidsModule,
  JwkDidRegistrar,
  JwkDidResolver,
  KeyDidRegistrar,
  KeyDidResolver,
  KeyType,
  MediationRecipientModule,
  MediatorPickupStrategy,
  PeerDidRegistrar,
  PeerDidResolver,
  TypedArrayEncoder,
  WebDidResolver,
} from '@credo-ts/core'
import { HederaDidResolver, HederaDidRegistrar, HederaAnonCredsRegistry, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/react-native'
import { anoncreds } from '@hyperledger/anoncreds-react-native'
import { WalletSecret, getAgentModules } from '@hyperledger/aries-bifold-core'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Config } from 'react-native-config'

import { IndyBesuConfig, IndyBesuDidResolver } from '../indy-besu'
import { IndyBesuAnoncredsRegistry } from '../indy-besu/anoncreds'
import { CredoLogger } from '../logger'

import { TailsService } from './revocation/TailsService'

const PUBLIC_DID_KEY = 'PUBLIC_DID'

interface CreateAgentOptions {
  credentials: WalletSecret
  indyLedgers: IndyVdrPoolConfig[]
  indyBesuConfig: IndyBesuConfig
  walletName?: string
}

export async function createAgent({ credentials, indyLedgers, indyBesuConfig, walletName }: CreateAgentOptions) {
  if (!credentials.key) {
    throw new Error('Wallet key is not defined')
  }

  return new Agent({
    config: {
      label: walletName || 'Heka Wallet',
      walletConfig: {
        id: credentials.id,
        key: credentials.key,
      },
      logger: new CredoLogger('Credo Agent'),
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: {
      ...getAgentModules({
        indyNetworks: indyLedgers,
        mediatorInvitationUrl: Config.MEDIATOR_URL,
      }),
      mediationRecipient: new MediationRecipientModule({
        mediatorInvitationUrl: Config.MEDIATOR_URL,
        mediatorPickupStrategy: MediatorPickupStrategy.PickUpV2,
      }),
      dids: new DidsModule({
        resolvers: [
          new WebDidResolver(),
          new KeyDidResolver(),
          new PeerDidResolver(),
          new JwkDidResolver(),
          new IndyBesuDidResolver(indyBesuConfig),
          new HederaDidResolver(),
        ],
        registrars: [new KeyDidRegistrar(), new PeerDidRegistrar(), new JwkDidRegistrar(), new HederaDidRegistrar()],
      }),
      anoncreds: new AnonCredsModule({
        anoncreds,
        registries: [
          new IndyVdrAnonCredsRegistry(),
          new IndyBesuAnoncredsRegistry(indyBesuConfig),
          new HederaAnonCredsRegistry(),
        ],
        tailsFileService: new TailsService(),
      }),
      hedera: new HederaModule({
        networks: [
          {
            network: 'testnet',
            operatorId: Config.HEDERA_OPERATOR_ID ?? '0.0.5065521',
            operatorKey:
              Config.HEDERA_OPERATOR_KEY ??
              '302e020100300506032b657004220420e4f76aa303bfbf350ad080b879173b31977e5661d51ff5932f6597e2bb6680ff',
          },
        ],
      }),
    },
  })
}

export interface PublicDidKeyOptions {
  privateKey?: string
  keyType: KeyType
  useJwkJcsPub: boolean
}

export async function createPublicDidOrGetExisting(
  agent: Agent,
  publicDidKeyOptions: PublicDidKeyOptions
): Promise<string> {
  let publicDid = await AsyncStorage.getItem(PUBLIC_DID_KEY)

  if (publicDid) {
    const didRecordSearchResult = await agent.dids.getCreatedDids({
      method: 'key',
      did: publicDid,
    })

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (didRecordSearchResult.length === 0) {
      throw new Error('Public DID is already created, but corresponding DID record is not found')
    }
  } else {
    const { privateKey, ...didCreationOptions } = publicDidKeyOptions

    const didCreateResult = await agent.dids.create({
      method: 'key',
      options: didCreationOptions,
      secret: privateKey ? { privateKey: TypedArrayEncoder.fromString(privateKey) } : undefined,
    })

    if (!didCreateResult.didState.didDocument) {
      throw new Error(`Failed to create public DID: ${JSON.stringify(didCreateResult, null, 2)}`)
    }

    publicDid = didCreateResult.didState.didDocument.id
    await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid)
  }

  return publicDid
}

export async function tryRestartExistingAgent(agent: Agent, credentials: WalletSecret): Promise<boolean> {
  if (!credentials.key) {
    console.warn('Wallet credentials key is not defined')
    return false
  }

  try {
    await agent.wallet.open({
      id: credentials.id,
      key: credentials.key,
    })
    await agent.initialize()
  } catch (error) {
    console.warn(`Agent restart failed with error ${error}`)
    // if the existing agents wallet cannot be opened or initialize() fails it was
    // again not a clean shutdown and the agent should be replaced, not restarted
    return false
  }

  return true
}
