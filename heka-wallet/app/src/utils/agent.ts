import { getAgentModules, WalletSecret } from '@bifold/core'
import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsDidCommProofFormatService,
  AnonCredsModule,
  DataIntegrityDidCommCredentialFormatService,
  DidCommCredentialV1Protocol,
  DidCommProofV1Protocol,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
} from '@credo-ts/anoncreds'
import {
  Agent,
  DidsModule,
  JwkDidRegistrar,
  JwkDidResolver,
  KeyDidRegistrar,
  KeyDidResolver,
  PeerDidNumAlgo,
  PeerDidRegistrar,
  PeerDidResolver,
  SdJwtVcRecord,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'
import {
  DidCommAutoAcceptCredential,
  DidCommAutoAcceptProof,
  DidCommCredentialV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommMediatorPickupStrategy,
  DidCommModule,
  DidCommOutOfBandRecord,
  DidCommProofV2Protocol,
} from '@credo-ts/didcomm'
import {
  createPeerDidFromServices,
  routingToServices,
  // @ts-expect-error - TODO: Resolve type import issues or move helpers implementation to project codebase
} from '@credo-ts/didcomm/build/modules/connections/services/helpers.mjs'
import { HederaAnonCredsRegistry, HederaDidRegistrar, HederaDidResolver, HederaModule } from '@credo-ts/hedera'
import { IndyVdrAnonCredsRegistry, IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { agentDependencies } from '@credo-ts/react-native'
import { anoncreds } from '@hyperledger/anoncreds-react-native'
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
  walletSecret: WalletSecret
  indyLedgers: IndyVdrPoolConfig[]
  indyBesuConfig: IndyBesuConfig
  walletName?: string
}

export type HekaWalletAgent = Awaited<ReturnType<typeof createAgent>>

export async function createAgent({ walletSecret, indyLedgers, indyBesuConfig, walletName: _ }: CreateAgentOptions) {
  if (!walletSecret.key) {
    throw new Error('Wallet key is not defined')
  }

  const indyCredentialFormat = new LegacyIndyDidCommCredentialFormatService()
  const indyProofFormat = new LegacyIndyDidCommProofFormatService()

  return new Agent({
    config: {
      logger: new CredoLogger('Credo Agent'),
      autoUpdateStorageOnStartup: true,
    },
    dependencies: agentDependencies,
    modules: {
      ...getAgentModules({
        walletSecret,
        indyNetworks: indyLedgers,
        mediatorInvitationUrl: Config.MEDIATOR_URL,
      }),
      didcomm: new DidCommModule({
        useDidSovPrefixWhereAllowed: true,
        connections: {
          autoAcceptConnections: true,
        },
        credentials: {
          autoAcceptCredentials: DidCommAutoAcceptCredential.ContentApproved,
          credentialProtocols: [
            new DidCommCredentialV1Protocol({ indyCredentialFormat }),
            new DidCommCredentialV2Protocol({
              credentialFormats: [
                indyCredentialFormat,
                new AnonCredsDidCommCredentialFormatService(),
                new DataIntegrityDidCommCredentialFormatService(),
              ],
            }),
          ],
        },
        proofs: {
          autoAcceptProofs: DidCommAutoAcceptProof.ContentApproved,
          proofProtocols: [
            new DidCommProofV1Protocol({ indyProofFormat }),
            new DidCommProofV2Protocol({
              proofFormats: [
                indyProofFormat,
                new AnonCredsDidCommProofFormatService(),
                new DidCommDifPresentationExchangeProofFormatService(),
              ],
            }),
          ],
        },
        mediationRecipient: {
          mediatorInvitationUrl: Config.MEDIATOR_URL,
          mediatorPickupStrategy: DidCommMediatorPickupStrategy.PickUpV2,
        },
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
      x509: new X509Module({
        trustedCertificates: [
          'MIIBmTCCAT+gAwIBAgIUJeybJ59oAtHqC1RAo1ySrqCUdyEwCgYIKoZIzj0EAwIwIjELMAkGA1UEBhMCVVMxEzARBgNVBAMMCk1ETCBJc3N1ZXIwHhcNMjYwMzE2MTIxOTQxWhcNMjcwMzE2MTIxOTQxWjAiMQswCQYDVQQGEwJVUzETMBEGA1UEAwwKTURMIElzc3VlcjBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABBl3oLjMhrHR3uZxNUdyxEboo7OGsvqLdn5j3HGHFg+lL77U3yvUFZcYFtPr8Bc49tc8eRkbIBQaf3ebikmEIAKjUzBRMB0GA1UdDgQWBBRgERzGBBlp2rVChhxwubMS3rSP9jAfBgNVHSMEGDAWgBRgERzGBBlp2rVChhxwubMS3rSP9jAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQDXrhjDDTiR3yMVD1q0yjadoqC3p/5Zc8RswG20M0IBDwIgPblEkraphygeYXDEzEnuIour1SeKHsf4JJuyn2mPkYo=',
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
    const routing = await agent.didcomm.mediationRecipient.getRouting({})

    const { didDocument: didPeerDocument } = await createPeerDidFromServices(
      agent.context,
      routingToServices(routing),
      PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc
    )

    publicDid = didPeerDocument.id
    await AsyncStorage.setItem(PUBLIC_DID_KEY, publicDid!)
  }

  return publicDid!
}

export async function tryRestartExistingAgent(agent: Agent, credentials: WalletSecret): Promise<boolean> {
  if (!credentials.key) {
    console.warn('Wallet credentials key is not defined')
    return false
  }

  try {
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

  let publicInvitationRecord: DidCommOutOfBandRecord

  if (publicInvitationId) {
    publicInvitationRecord = await agent.didcomm.oob.findById(publicInvitationId)

    // Should not be possible from UI/UX perspective or other reasons, just sanity check
    if (!publicInvitationRecord) {
      throw new Error('Public invitation is already created, but corresponding invitation record is not found')
    }
  } else {
    publicInvitationRecord = await agent.didcomm.oob.createInvitation({
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

  const issuerPublicKey = await agent.kms.createKey({
    type: {
      kty: 'OKP',
      crv: 'Ed25519',
    },
  })

  const issuerDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyId: issuerPublicKey.keyId },
  })

  if (!issuerDidCreateResult.didState.didDocument) {
    throw new Error(
      `Failed to create issuer DID for example credential: ${JSON.stringify(issuerDidCreateResult, null, 2)}`
    )
  }

  const holderPublicKey = await agent.kms.createKey({
    type: {
      kty: 'OKP',
      crv: 'Ed25519',
    },
  })

  const holderDidCreateResult = await agent.dids.create({
    method: 'key',
    options: { keyId: holderPublicKey },
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

  const record = new SdJwtVcRecord({
    credentialInstances: [
      {
        compactSdJwtVc: signedSdJwtVc.compact,
      },
    ],
  })

  setOpenId4VcCredentialMetadata(record, EXAMPLE_CREDENTIAL_METADATA)

  await agent.sdJwtVc.store({ record })
}

export async function setupMediatorWithPublicDidIfNeeded(agent: Agent, mediatorPublicDid: string): Promise<void> {
  const existingMediationRecord = await agent.didcomm.mediationRecipient.findDefaultMediator()
  if (existingMediationRecord) return

  let { connectionRecord: mediatorConnectionRecord } = await agent.didcomm.oob.receiveImplicitInvitation({
    label: 'Cloud Mediator',
    did: mediatorPublicDid,
    alias: 'Cloud Mediator',
    autoAcceptConnection: true,
  })

  if (!mediatorConnectionRecord) {
    throw new Error(`Failed to connect with mediator via public DID: ${mediatorPublicDid}`)
  }

  mediatorConnectionRecord = await agent.didcomm.connections.returnWhenIsConnected(mediatorConnectionRecord.id, {
    timeoutMs: 5000,
  })

  await agent.didcomm.mediationRecipient.provision(mediatorConnectionRecord)
}
