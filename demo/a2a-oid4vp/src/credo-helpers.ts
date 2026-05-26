import { Agent as CredoAgent, ConsoleLogger, LogLevel, PeerDidNumAlgo } from '@credo-ts/core'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommHttpOutboundTransport, DidCommModule, DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import { AskarModule } from '@credo-ts/askar'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'

export type CredoAgentWithDidComm = CredoAgent<{ didcomm: DidCommModule }>

export function createCredoAgent(agentName: string, inboundPort: number = 3010): CredoAgentWithDidComm {
  // Wallet encryption key must be set via DEMO_AGENT_WALLET_KEY env var
  // Minimum 32 characters recommended for production use
  const walletKey = process.env.DEMO_AGENT_WALLET_KEY
  if (!walletKey) {
    throw new Error('DEMO_AGENT_WALLET_KEY environment variable is required but not set')
  }

  const agentHttpEndpoint = `http://localhost:${inboundPort}`

  const agent = new CredoAgent({
    config: {
      logger: new ConsoleLogger(LogLevel.info),
      allowInsecureHttpUrls: true,
    },
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar: askarNodeJS,
        store: {
          id: agentName,
          key: walletKey,
          database: {
            type: 'sqlite',
            config: {
              inMemory: true,
            },
          },
        },
      }),
      didcomm: new DidCommModule({
        endpoints: [agentHttpEndpoint],
        connections: { peerNumAlgoForDidExchangeRequests: PeerDidNumAlgo.MultipleInceptionKeyWithoutDoc },
      }),
    },
  })

  agent.didcomm.registerInboundTransport(new DidCommHttpInboundTransport({ port: inboundPort }))
  agent.didcomm.registerOutboundTransport(new DidCommHttpOutboundTransport())
  agent.didcomm.registerOutboundTransport(new DidCommWsOutboundTransport())

  return agent
}
