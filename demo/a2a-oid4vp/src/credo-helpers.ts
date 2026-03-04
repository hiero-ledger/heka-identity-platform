import { Agent as CredoAgent, ConsoleLogger, LogLevel, PeerDidNumAlgo } from '@credo-ts/core'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommHttpOutboundTransport, DidCommModule, DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import { AskarModule } from '@credo-ts/askar'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'

export type CredoAgentWithDidComm = CredoAgent<{ didcomm: DidCommModule }>

export function createCredoAgent(agentName: string, inboundPort: number = 3010): CredoAgentWithDidComm {
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
          key: 'key',
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
