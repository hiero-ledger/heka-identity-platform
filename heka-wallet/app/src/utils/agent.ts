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
  OutOfBandRecord,
  PeerDidNumAlgo,
  PeerDidRegistrar,
  PeerDidResolver,
  WebDidResolver,
} from '@credo-ts/core'
import { createPeerDidFromServices, routingToServices } from '@credo-ts/core/build/modules/connections/services/helpers'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/react-native'
import { anoncreds } from '@hyperledger/anoncreds-react-native'
import { getAgentModules, WalletSecret } from '@hyperledger/aries-bifold-core'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Config } from 'react-native-config'

import { OpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from '../credentials/metadata'
import { IndyBesuConfig, IndyBesuDidResolver } from '../indy-besu'
import { IndyBesuAnoncredsRegistry } from '../indy-besu/anoncreds'
import { CredoLogger } from '../logger'

import { getDidKeyVerificationMethodId } from './did'
import { TailsService } from './revocation/TailsService'

const PUBLIC_DID_KEY = 'PUBLIC_DID'

const PUBLIC_INVITATION_ID_KEY = 'PUBLIC_INVITATION_ID'

const EXAMPLE_CREDENTIAL_VCT = 'ExampleCredential'
const EXAMPLE_CREDENTIAL_METADATA: OpenId4VcCredentialMetadata = {
  issuer: {
    id: 'example-issuer-id',
    display: [{ name: 'DSR' }],
  },
  credential: {},
}

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

export async function createPublicDidOrGetExisting(agent: Agent): Promise<string> {
  let publicDid = await AsyncStorage.getItem(PUBLIC_DID_KEY)

  if (publicDid) {
    const didRecordSearchResult = await agent.dids.getCreatedDids({
      method: 'peer',
      did: publicDid,
    })

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (didRecordSearchResult.length === 0) {
      throw new Error('Public DID is already created, but corresponding DID record is not found')
    }
  } else {
    const routing = await agent.mediationRecipient.getRouting({})

    const didPeerDocument = await createPeerDidFromServices(
      agent.context,
      routingToServices(routing),
      PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc
    )

    publicDid = didPeerDocument.id
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

export async function createPublicInvitationOrGetExisting(agent: Agent, invitationDid: string): Promise<string> {
  const publicInvitationId = await AsyncStorage.getItem(PUBLIC_INVITATION_ID_KEY)

  let publicInvitationRecord: OutOfBandRecord | null

  if (publicInvitationId) {
    publicInvitationRecord = await agent.oob.findById(publicInvitationId)

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (!publicInvitationRecord) {
      throw new Error('Public invitation is already created, but corresponding invitation record is not found')
    }
  } else {
    publicInvitationRecord = await agent.oob.createInvitation({
      invitationDid,
      multiUseInvitation: true,
    })

    await AsyncStorage.setItem(PUBLIC_INVITATION_ID_KEY, publicInvitationRecord.id)
  }

  return publicInvitationRecord.outOfBandInvitation.toUrl({ domain: 'didcomm://invite' })
}

export async function ensureExampleCredentialCreated(agent: Agent): Promise<void> {
  const exampleCredentialRecords = await agent.sdJwtVc.findAllByQuery({
    vct: EXAMPLE_CREDENTIAL_VCT,
  })

  if (exampleCredentialRecords.length > 0) return

  const issuerDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyType: KeyType.P256, useJwkJcsPub: true },
  })

  if (!issuerDidCreateResult.didState.didDocument) {
    throw new Error(
      `Failed to create issuer DID for example credential: ${JSON.stringify(issuerDidCreateResult, null, 2)}`
    )
  }

  const holderDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyType: KeyType.P256, useJwkJcsPub: true },
  })

  if (!holderDidCreateResult.didState.didDocument) {
    throw new Error(
      `Failed to create holder DID for example credential: ${JSON.stringify(issuerDidCreateResult, null, 2)}`
    )
  }

  const holderKid = getDidKeyVerificationMethodId(holderDidCreateResult.didState.didDocument.id)

  const signedSdJwtVc = await agent.sdJwtVc.sign({
    holder: { method: 'did', didUrl: holderKid },
    issuer: {
      method: 'did',
      didUrl: getDidKeyVerificationMethodId(issuerDidCreateResult.didState.didDocument.id),
    },
    payload: {
      vct: EXAMPLE_CREDENTIAL_VCT,
      university: 'innsbruck',
      degree: 'bachelor',
      name: 'John Doe',
      cnf: {
        kid: holderKid,
      },
    },
    disclosureFrame: {
      _sd: ['university', 'name'],
    },
  })

  const record = await agent.sdJwtVc.store(signedSdJwtVc.compact)

  setOpenId4VcCredentialMetadata(record, EXAMPLE_CREDENTIAL_METADATA)

  await agent.sdJwtVc.update(record)
}

export async function setupMediatorWithPublicDidIfNeeded(agent: Agent, mediatorPublicDid: string): Promise<void> {
  const existingMediationRecord = await agent.mediationRecipient.findDefaultMediator()
  if (existingMediationRecord) return

  let { connectionRecord: mediatorConnectionRecord } = await agent.oob.receiveImplicitInvitation({
    label: 'Cloud Mediator',
    did: mediatorPublicDid,
    alias: 'Cloud Mediator',
    autoAcceptConnection: true,
  })

  if (!mediatorConnectionRecord) {
    throw new Error(`Failed to connect with mediator via public DID: ${mediatorPublicDid}`)
  }

  mediatorConnectionRecord = await agent.connections.returnWhenIsConnected(mediatorConnectionRecord.id, {
    timeoutMs: 5000,
  })

  await agent.mediationRecipient.provision(mediatorConnectionRecord)
}
