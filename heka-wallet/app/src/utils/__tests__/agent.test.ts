import { Config } from 'react-native-config'

import { createAgent } from '../agent'

// ── Heavy native / third-party module mocks ──────────────────────────────────

jest.mock('@credo-ts/anoncreds', () => ({
  AnonCredsModule: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@credo-ts/core', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  DidsModule: jest.fn().mockImplementation(() => ({})),
  JwkDidRegistrar: jest.fn().mockImplementation(() => ({})),
  JwkDidResolver: jest.fn().mockImplementation(() => ({})),
  KeyDidRegistrar: jest.fn().mockImplementation(() => ({})),
  KeyDidResolver: jest.fn().mockImplementation(() => ({})),
  KeyType: { P256: 'P256', Ed25519: 'Ed25519' },
  MediationRecipientModule: jest.fn().mockImplementation(() => ({})),
  MediatorPickupStrategy: { PickUpV2: 'PickUpV2' },
  OutOfBandRecord: jest.fn(),
  PeerDidNumAlgo: { MultipleInceptionKeyWithoutDoc: 1 },
  PeerDidRegistrar: jest.fn().mockImplementation(() => ({})),
  PeerDidResolver: jest.fn().mockImplementation(() => ({})),
  WebDidResolver: jest.fn().mockImplementation(() => ({})),
  X509Module: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@credo-ts/core/build/modules/connections/services/helpers', () => ({
  createPeerDidFromServices: jest.fn(),
  routingToServices: jest.fn(),
}))

jest.mock('@credo-ts/hedera', () => ({
  HederaAnonCredsRegistry: jest.fn().mockImplementation(() => ({})),
  HederaDidRegistrar: jest.fn().mockImplementation(() => ({})),
  HederaDidResolver: jest.fn().mockImplementation(() => ({})),
  HederaModule: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@credo-ts/indy-vdr', () => ({
  IndyVdrAnonCredsRegistry: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@credo-ts/react-native', () => ({
  agentDependencies: {},
}))

jest.mock('@hyperledger/anoncreds-react-native', () => ({
  anoncreds: {},
}))

jest.mock('@hyperledger/aries-bifold-core', () => ({
  getAgentModules: jest.fn().mockReturnValue({}),
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}))

jest.mock('react-native-config', () => ({
  Config: {
    HEDERA_OPERATOR_ID: undefined as string | undefined,
    HEDERA_OPERATOR_KEY: undefined as string | undefined,
    MEDIATOR_URL: undefined as string | undefined,
  },
}))

// ── Local module mocks ────────────────────────────────────────────────────────

jest.mock('../../credentials/metadata', () => ({
  setOpenId4VcCredentialMetadata: jest.fn(),
}))

jest.mock('../../indy-besu', () => ({
  IndyBesuDidResolver: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('../../indy-besu/anoncreds', () => ({
  IndyBesuAnoncredsRegistry: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('../../logger', () => ({
  CredoLogger: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('../did', () => ({
  getDidKeyVerificationMethodId: jest.fn(),
}))

jest.mock('../revocation/TailsService', () => ({
  TailsService: jest.fn().mockImplementation(() => ({})),
}))

// ── Typed handle to the mutable Config mock ───────────────────────────────────

const mockConfig = Config as unknown as {
  HEDERA_OPERATOR_ID: string | undefined
  HEDERA_OPERATOR_KEY: string | undefined
  MEDIATOR_URL: string | undefined
}

// ── Shared test fixtures ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validCredentials = { id: 'test-wallet-id', key: 'test-wallet-key' } as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validIndyLedgers: any[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validIndyBesuConfig = {} as any

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createAgent — Hedera operator credential validation', () => {
  beforeEach(() => {
    mockConfig.HEDERA_OPERATOR_ID = undefined
    mockConfig.HEDERA_OPERATOR_KEY = undefined
    mockConfig.MEDIATOR_URL = undefined
  })

  it('throws if HEDERA_OPERATOR_ID is missing', async () => {
    mockConfig.HEDERA_OPERATOR_KEY = 'valid-test-key'

    await expect(
      createAgent({ credentials: validCredentials, indyLedgers: validIndyLedgers, indyBesuConfig: validIndyBesuConfig })
    ).rejects.toThrow(
      'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set via react-native-config. See .env.example for setup instructions.'
    )
  })

  it('throws if HEDERA_OPERATOR_KEY is missing', async () => {
    mockConfig.HEDERA_OPERATOR_ID = '0.0.12345'

    await expect(
      createAgent({ credentials: validCredentials, indyLedgers: validIndyLedgers, indyBesuConfig: validIndyBesuConfig })
    ).rejects.toThrow(
      'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set via react-native-config. See .env.example for setup instructions.'
    )
  })

  it('throws if both HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are missing', async () => {
    await expect(
      createAgent({ credentials: validCredentials, indyLedgers: validIndyLedgers, indyBesuConfig: validIndyBesuConfig })
    ).rejects.toThrow(
      'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set via react-native-config. See .env.example for setup instructions.'
    )
  })

  it('does not throw when both HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are provided', async () => {
    mockConfig.HEDERA_OPERATOR_ID = '0.0.12345'
    mockConfig.HEDERA_OPERATOR_KEY = 'ed25519-test-private-key'

    await expect(
      createAgent({ credentials: validCredentials, indyLedgers: validIndyLedgers, indyBesuConfig: validIndyBesuConfig })
    ).resolves.toBeDefined()
  })
})
