import { getAgentModules, WalletSecret } from '@bifold/core'
import { useOptionalAgent } from '@bifold/react-hooks'
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
  Mdoc,
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
import { NativeAnoncreds } from '@hyperledger/anoncreds-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Config } from 'react-native-config'

import { OpenId4VcCredentialMetadata, setOpenId4VcCredentialMetadata } from '../credentials/metadata'
import { IndyBesuConfig, IndyBesuDidResolver } from '../indy-besu'
import { IndyBesuAnoncredsRegistry } from '../indy-besu/anoncreds'
import { CredoLogger } from '../logger'

import { getDidKeyVerificationMethodId } from './did'
import { TailsService } from './revocation/TailsService'
import { EuRefreshResult, EuTrustListAgent, refreshEuTrustList } from './trust/euTrustListService'
import { issuerTrustStore } from './trust/issuerTrustStore'
import { refreshIssuerTrustList, RefreshResult, TrustListAgent } from './trust/trustListService'

const PUBLIC_DID_KEY = 'PUBLIC_DID'

const PUBLIC_INVITATION_ID_KEY = 'PUBLIC_INVITATION_ID'

/**
 * Bundled mdoc **issuer** trust anchor(s) (base64 DER). This is the **interim** anchor used until the
 * Heka VICAL is fetched and verified: {@link refreshHekaIssuerTrustList} learns the per-tenant IACA
 * anchors from the signed VICAL and adds them to the trusted set. The default value is the dev mDL
 * issuer cert.
 */
export const TRUSTED_X509_CERTIFICATES = [
  'MIIBwDCCAWWgAwIBAgIUSMdjaVc1KHI+3o6qJXhSC4sJh+cwCgYIKoZIzj0EAwIwNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMB4XDTI2MDMyNzIxNDA1NloXDTM2MDMyNDIxNDA1NlowNTEXMBUGA1UEAwwObURMIElzc3VlciBEZXYxDTALBgNVBAoMBEhla2ExCzAJBgNVBAYTAlVTMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1nIrm3O9VX8MdPrKWMhqqV0QMS4UtxKj6uUc8IdGE2fSsWyi7XQN3HoE1Ln9TDtOIHvSyW8Eyr98MlWGBBF/vqNTMFEwHQYDVR0OBBYEFNfkrHxd2nwtni96XrrYhaMgUFImMB8GA1UdIwQYMBaAFNfkrHxd2nwtni96XrrYhaMgUFImMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAP0V5EW7j6Pb+lJktzdWrtEqhI3mYs9Fd+qh0p2kNXJPAiEAqK+q7Wk+t5e2yzvO3b6t3P5nIEnoQt3cvDsaUZY1dT0=',
] as const

/**
 * The Heka service **root CA** (base64 DER) that the VICAL signer chains to. The wallet trusts
 * this one long-lived root to verify the fetched VICAL — it is NOT itself an mdoc issuer anchor.
 * Obtain it from the identity service's `GET /x509/signers/root-certificate` and set
 * `HEKA_SERVICE_ROOT_CERTIFICATE`. Empty by default = the VICAL cannot be verified yet (refresh skips).
 */
const HEKA_SERVICE_ROOT_CERTIFICATES: string[] = [Config.HEKA_SERVICE_ROOT_CERTIFICATE].filter(
  (certificate): certificate is string => Boolean(certificate)
)

/** Resolve the Heka VICAL endpoint URL: explicit `VICAL_URL`, else `<AGENCY_PROVIDER_URL>/vical`. */
const getVicalUrl = (): string | undefined => {
  if (Config.VICAL_URL) return Config.VICAL_URL
  return Config.AGENCY_PROVIDER_URL ? `${Config.AGENCY_PROVIDER_URL.replace(/\/+$/, '')}/vical` : undefined
}

/** Resolve the Heka EU trust-list URL: explicit `EU_TRUST_LIST_URL`, else `<AGENCY_PROVIDER_URL>/eu-trust-list`. */
const getEuTrustListUrl = (): string | undefined => {
  if (Config.EU_TRUST_LIST_URL) return Config.EU_TRUST_LIST_URL
  return Config.AGENCY_PROVIDER_URL ? `${Config.AGENCY_PROVIDER_URL.replace(/\/+$/, '')}/eu-trust-list` : undefined
}

/**
 * Trusted X.509 certificates for verifying OpenID4VP authorization-request **signers** (the
 * verifier's `x5c` request signature). This is a DISTINCT trust domain from
 * `TRUSTED_X509_CERTIFICATES`, which is the mDL **issuer** anchor used to verify credential (MSO)
 * signatures — do not conflate them.
 *
 * Populate with the verifier's request-signing **leaf** cert (base64 DER) for the `x509_hash` trust
 * model, or its **root/CA** for `x509_san_dns`. Obtain the cert from the verifier's
 * `/x509/signers` endpoint. Empty by default = no request signer is trusted yet.
 */
export const TRUSTED_REQUEST_SIGNER_CERTIFICATES: string[] = []

/** The X509 verification context passed by Credo's X509Module (structural subset we branch on). */
export type X509VerificationContext = { type: string; credential?: unknown }

/**
 * Resolve trusted certificates per verification context. Three distinct trust domains:
 *  - the verifier's signed authorization request: the request-signer set;
 *  - an SD-JWT VC credential: the Heka service root (the HAIP x5c issuer leaf chains to it);
 *  - any other credential (notably mdoc/MSO): the mdoc issuer anchors (VICAL-learned per-tenant IACAs
 *    plus the interim bundled anchor).
 *
 * mdoc MSOs deliberately do NOT trust the service root (it is not an mdoc issuer anchor), keeping the
 * issuer-credential and SD-JWT-VC trust domains separate. Used by the main and lean DC API agents.
 */
export const trustedCertificatesForVerification = (verification: X509VerificationContext): string[] => {
  if (verification.type === 'oauth2SecuredAuthorizationRequest') {
    return [...TRUSTED_REQUEST_SIGNER_CERTIFICATES]
  }
  // mdoc MSOs trust ONLY the per-tenant IACAs (VICAL-learned) + interim anchor — never the service
  // root (a service-root-signed leaf must not be able to forge an MSO).
  if (verification.type === 'credential' && verification.credential instanceof Mdoc) {
    return [...issuerTrustStore.getIssuerCertificates(), ...TRUSTED_X509_CERTIFICATES]
  }
  // SD-JWT VC x5c issuer leaves chain to the service root; other contexts (W3C, issuer metadata) are
  // DID/issuer-anchored and ignore the extras. Union is safe: an SD-JWT leaf won't chain to an IACA.
  return [...HEKA_SERVICE_ROOT_CERTIFICATES, ...issuerTrustStore.getIssuerCertificates(), ...TRUSTED_X509_CERTIFICATES]
}

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
}

export type HekaWalletAgent = Awaited<ReturnType<typeof createAgent>>

export const useHekaAgent = (): ReturnType<typeof useOptionalAgent<HekaWalletAgent>> =>
  useOptionalAgent<HekaWalletAgent>()

export async function createAgent({ walletSecret, indyLedgers, indyBesuConfig }: CreateAgentOptions) {
  if (!walletSecret.key) {
    throw new Error('Wallet key is not defined')
  }

  const indyCredentialFormat = new LegacyIndyDidCommCredentialFormatService()
  const indyProofFormat = new LegacyIndyDidCommProofFormatService()

  return new Agent({
    config: {
      logger: new CredoLogger('Credo Agent'),
      autoUpdateStorageOnStartup: true,
      allowInsecureHttpUrls: true,
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
        anoncreds: NativeAnoncreds.instance,
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
            operatorId: Config.HEDERA_OPERATOR_ID ?? '0.0.5489553',
            operatorKey:
              Config.HEDERA_OPERATOR_KEY ??
              '302e020100300506032b6570042204209f54b75b6238ced43e41b1463999cb40bf2f7dd2c9fd4fd3ef780027c016a138',
          },
        ],
      }),
      x509: new X509Module({
        trustedCertificates: [...TRUSTED_X509_CERTIFICATES],
        getTrustedCertificatesForVerification: (_agentContext, { verification }) =>
          trustedCertificatesForVerification(verification),
      }),
    },
  })
}

/**
 * Fetch + verify the Heka VICAL and refresh the mdoc issuer trust anchors (the per-tenant IACAs that
 * `trustedCertificatesForVerification` then trusts for credential/MSO verification). Best-effort:
 * returns a result rather than throwing. A no-op unless both a VICAL URL and the service root
 * (`HEKA_SERVICE_ROOT_CERTIFICATE`) are configured. Call after the agent is initialized.
 */
export async function refreshHekaIssuerTrustList(agent: HekaWalletAgent): Promise<RefreshResult> {
  // The concrete agent satisfies the loose structural TrustListAgent at runtime; the cast bridges the
  // strict Credo KMS/X509 option types to the decoupled (test-friendly) interface.
  return refreshIssuerTrustList(agent as unknown as TrustListAgent, {
    vicalUrl: getVicalUrl(),
    trustedRootCertificates: HEKA_SERVICE_ROOT_CERTIFICATES,
  })
}

/**
 * Fetch + verify the Heka EU trust list and refresh the EU slice of the issuer trust anchors (curated
 * external EU issuer CAs). Best-effort; a no-op unless both the EU trust-list URL and the service root
 * (`HEKA_SERVICE_ROOT_CERTIFICATE`) are configured. Mirrors {@link refreshHekaIssuerTrustList}.
 */
export async function refreshHekaEuTrustList(agent: HekaWalletAgent): Promise<EuRefreshResult> {
  return refreshEuTrustList(agent as unknown as EuTrustListAgent, {
    euTrustListUrl: getEuTrustListUrl(),
    trustedRootCertificates: HEKA_SERVICE_ROOT_CERTIFICATES,
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

export async function createPublicInvitationOrGetExisting(
  agent: Agent,
  invitationDid: string,
  label: string
): Promise<string> {
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
      label,
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

  const mediationRecord = await agent.didcomm.mediationRecipient.provision(mediatorConnectionRecord)
  await agent.didcomm.mediationRecipient.initiateMessagePickup(mediationRecord)
}

export async function createAnoncredsLinkSecretIfRequired(agent: HekaWalletAgent): Promise<void> {
  // If we don't have any link secrets yet, we will create a
  // default link secret that will be used for all anoncreds
  // credential requests.
  const linkSecretIds = await agent.modules.anoncreds.getLinkSecretIds()
  if (linkSecretIds.length === 0) {
    await agent.modules.anoncreds.createLinkSecret({
      setAsDefault: true,
    })
  }
}
