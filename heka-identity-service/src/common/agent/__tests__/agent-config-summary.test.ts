import { Agent as CredoAgent } from '@credo-ts/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Logger } from 'common/logger'
import { ProtocolType } from 'common/types'
import AgentConfig from 'config/agent'
import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

import { summarizeAgentConfig } from '../agent-config-summary'
import { Agent } from '../agent.provider'

const AGENT_ENV_KEYS = [
  'AGENT_LABEL',
  'INDY_ENDORSER_SEED',
  'INDY_BESU_ENDORSER_PRIVATE_KEY',
  'INDY_BESU_NODE_ADDRESS',
  'HEDERA_OPERATOR_KEY',
  'HEDERA_OPERATOR_ID',
  'MDL_ISSUER_PRIVATE_KEY',
  'WALLET_POSTGRES_PASSWORD',
  'WALLET_POSTGRES_HOST',
  'WALLET_POSTGRES_PORT',
  'INDY_ENDORSER_DID',
  'DID_METHODS',
]

const SENTINELS = {
  // The Askar store id and key are derived from the label, so the label must not be logged either
  AGENT_LABEL: 'SentinelAgent',
  INDY_ENDORSER_SEED: 'seed-SENTINEL-0000000000000000001',
  INDY_BESU_ENDORSER_PRIVATE_KEY: 'besu-key-SENTINEL',
  HEDERA_OPERATOR_KEY: 'hedera-key-SENTINEL',
  MDL_ISSUER_KEY_D: 'mdl-d-SENTINEL',
  WALLET_POSTGRES_PASSWORD: 'wallet-db-password-SENTINEL',
  BESU_NODE_USER: 'besu-user-SENTINEL',
  BESU_NODE_PASSWORD: 'besu-pw-SENTINEL',
  BESU_NODE_API_KEY: 'besu-apikey-SENTINEL',
}

const DEFAULT_MDL_ISSUER_KEY_D = (JSON.parse(INSECURE_DEFAULTS.MDL_ISSUER_PRIVATE_KEY) as { d: string }).d

const sentinelEnv = () => {
  process.env.AGENT_LABEL = SENTINELS.AGENT_LABEL
  process.env.INDY_ENDORSER_SEED = SENTINELS.INDY_ENDORSER_SEED
  process.env.INDY_BESU_ENDORSER_PRIVATE_KEY = SENTINELS.INDY_BESU_ENDORSER_PRIVATE_KEY
  process.env.HEDERA_OPERATOR_KEY = SENTINELS.HEDERA_OPERATOR_KEY
  process.env.MDL_ISSUER_PRIVATE_KEY = JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: 'public-x',
    y: 'public-y',
    d: SENTINELS.MDL_ISSUER_KEY_D,
    kid: 'mdl-key-id',
  })
  process.env.WALLET_POSTGRES_PASSWORD = SENTINELS.WALLET_POSTGRES_PASSWORD
  process.env.INDY_BESU_NODE_ADDRESS = `https://${SENTINELS.BESU_NODE_USER}:${SENTINELS.BESU_NODE_PASSWORD}@rpc.example.com/v3/${SENTINELS.BESU_NODE_API_KEY}`
}

const expectNoSecrets = (serialized: string, secrets: string[]) => {
  for (const secret of secrets) {
    expect(serialized).not.toContain(secret)
  }
  expect(serialized).not.toContain('-wallet-key')
  expect(serialized).not.toContain('-wallet-id')
}

describe('summarizeAgentConfig', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    for (const key of AGENT_ENV_KEYS) {
      delete process.env[key]
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('keeps the operational fields and drops every configured secret', () => {
    sentinelEnv()
    const config = AgentConfig()

    const summary = summarizeAgentConfig(config)

    expect(summary.httpEndpoint).toBe(config.httpEndpoint)
    expect(summary.wsEndpoint).toBe(config.wsEndpoint)
    expect(summary.oid4vc).toEqual({
      port: config.oidConfig.port,
      issuanceEndpoint: config.oidConfig.issuanceEndpoint,
      verificationEndpoint: config.oidConfig.verificationEndpoint,
    })
    expect(summary.didMethods).toEqual(config.didMethods)
    expect(summary.indyEndorserDid).toBe(config.indyEndorserDid)
    expect(summary.hedera.operatorId).toBe(config.hederaOperatorId)
    expect(summary.indyNetworks.map((network) => network.indyNamespace)).toEqual(['bcovrin:test'])
    expect(summary.askarStore).toEqual({ databaseType: 'postgres', host: 'localhost:5432' })
    expect(summary.credentialsConfiguration).toEqual(config.credentialsConfiguration)
    expect(summary.mdlIssuer).toEqual({ certificateConfigured: true, keyId: 'mdl-key-id' })
    expect(summary.indyBesu.nodeAddress).toBe('https://rpc.example.com')

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('genesisTransactions')
    expectNoSecrets(serialized, Object.values(SENTINELS))
  })

  it('drops the publicly known default secrets when nothing is configured', () => {
    const summary = summarizeAgentConfig(AgentConfig())

    expectNoSecrets(JSON.stringify(summary), [
      INSECURE_DEFAULTS.INDY_ENDORSER_SEED,
      INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY,
      INSECURE_DEFAULTS.HEDERA_OPERATOR_KEY,
      DEFAULT_MDL_ISSUER_KEY_D,
      INSECURE_DEFAULTS.WALLET_POSTGRES_PASSWORD,
    ])
  })

  it('copies only the listed fields of the credentials configuration', () => {
    const config = AgentConfig()
    const oid4vc = config.credentialsConfiguration[ProtocolType.Oid4vc]
    // A field added to the credentials configuration later must not reach the log without a change here
    Object.assign(oid4vc, { futureField: 'CREDENTIALS-CONFIG-SENTINEL' })

    const summary = summarizeAgentConfig(config)

    expect(summary.credentialsConfiguration[ProtocolType.Oid4vc]).toEqual({
      credentials: oid4vc.credentials,
      networks: oid4vc.networks,
    })
    expect(JSON.stringify(summary)).not.toContain('CREDENTIALS-CONFIG-SENTINEL')
  })

  it('logs an unparsable node address as a placeholder', () => {
    process.env.INDY_BESU_NODE_ADDRESS = `not a url ${SENTINELS.BESU_NODE_API_KEY}`

    expect(summarizeAgentConfig(AgentConfig()).indyBesu.nodeAddress).toBe('<invalid URL>')
  })

  it('is what Agent.initialize logs, and no secret reaches the logger', async () => {
    sentinelEnv()
    // No ports: the WebSocket inbound transport would listen as soon as it is constructed
    const config = { ...AgentConfig(), httpPort: 0, wsPort: 0 }

    const calls: Array<{ method: string; args: unknown[] }> = []
    const captureLogger: Record<string, unknown> = {}
    for (const method of ['trace', 'traceObject', 'debug', 'info', 'warn', 'error', 'fatal']) {
      captureLogger[method] = (...args: unknown[]) => calls.push({ method, args })
    }
    captureLogger.child = () => captureLogger

    // Stop right after the config is logged, before Credo or the KMS are touched
    vi.spyOn(CredoAgent.prototype, 'initialize').mockRejectedValue(new Error('stopped after logging'))

    const agent = Object.create(Agent.prototype) as Agent
    Object.assign(agent, {
      agencyConfig: config,
      agencyLogger: captureLogger as unknown as Logger,
      modules: { didcomm: { registerOutboundTransport: vi.fn(), registerInboundTransport: vi.fn() } },
    })

    await expect(agent.initialize()).rejects.toThrow('stopped after logging')

    expectNoSecrets(JSON.stringify(calls), Object.values(SENTINELS))
    expect(calls).toContainEqual({
      method: 'info',
      args: [{ agentConfig: summarizeAgentConfig(config) }, 'Agent config'],
    })
  })
})
