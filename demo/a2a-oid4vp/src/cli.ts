#!/usr/bin/env node

import readline from 'node:readline'

import {
  AgentCard,
  Message,
  Part,
  Role,
  SendMessageRequest,
  Task,
  TaskArtifactUpdateEvent,
  TaskState,
  TaskStatusUpdateEvent,
  taskStateToJSON,
} from '@a2a-js/sdk'
import {
  BeforeArgs,
  CallInterceptor,
  Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  ServiceParameters,
  withA2AExtensions,
} from '@a2a-js/sdk/client'
import { createCredoAgent, CredoAgentWithDidComm } from './credo-helpers'
import { IN_TASK_OID4VP_EXTENSION_URI, InTaskOpenId4VpMessageMetadata } from './a2a-oid4vp-extension'
import { requireEnv, TERMINAL_TASK_STATES, textPart, uuid } from './a2a-helpers'
import * as dotenv from 'dotenv'
import {
  DidCommConnectionRecord,
  DidCommConnectionRepository,
  DidCommDidExchangeRole,
  DidCommDidExchangeState,
} from '@credo-ts/didcomm'

dotenv.config()

const HOLDER_PUBLIC_DID = requireEnv('HOLDER_PUBLIC_DID')

// TODO: Switch to 'HOLDER_INVITATION_URL' usage after updating Heka Wallet to Credo 0.6.0+
// const HOLDER_INVITATION_URL = requireEnv('HOLDER_INVITATION_URL')

const CLI_CLIENT_PORT = Number(process.env.CLI_CLIENT_PORT) || 3010

// ANSI Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`
}

let currentTaskId: string | undefined = undefined
let currentContextId: string | undefined = undefined

const DEMO_AGENT_PORT = Number(process.env.DEMO_AGENT_PORT) || 10003

const serverUrl = `http://localhost:${DEMO_AGENT_PORT}`
let client: Client
let agentName = 'Agent' // Default, replaced by the agent card name

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

let inputClosed = false
rl.on('close', () => {
  inputClosed = true
})

/** Resolves to null once stdin is closed (Ctrl+D, or a piped script running out of input). */
function question(prompt: string): Promise<string | null> {
  if (inputClosed) return Promise.resolve(null)

  return new Promise((resolve) => {
    const onClose = () => resolve(null)
    rl.once('close', onClose)
    rl.question(prompt, (answer) => {
      rl.removeListener('close', onClose)
      resolve(answer)
    })
  })
}

class InTaskOpenId4VpInterceptor implements CallInterceptor {
  public async before(args: BeforeArgs): Promise<void> {
    const method = args.input?.method
    if (method !== 'sendMessage' && method !== 'sendMessageStream') return

    if (!args.options) args.options = {}
    args.options.serviceParameters = ServiceParameters.createFrom(
      args.options.serviceParameters,
      withA2AExtensions(IN_TASK_OID4VP_EXTENSION_URI)
    )
  }

  public async after(): Promise<void> {
    return
  }
}

async function createClient(): Promise<AgentCard> {
  console.log(colorize('dim', `Attempting to fetch agent card from agent at: ${serverUrl}`))

  const agentCard = await new DefaultAgentCardResolver().resolve(serverUrl)
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory()],
      clientConfig: { interceptors: [new InTaskOpenId4VpInterceptor()] },
    })
  )
  client = await factory.createFromAgentCard(agentCard)
  return agentCard
}

function displayAgentCard(card: AgentCard) {
  agentName = card.name || 'Agent'

  console.log(colorize('green', `✓ Agent Card Found:`))
  console.log(`  Name:        ${colorize('bright', agentName)}`)
  if (card.description) {
    console.log(`  Description: ${card.description}`)
  }
  console.log(`  Version:     ${card.version || 'N/A'}`)

  if (card.capabilities?.streaming) {
    console.log(`  Streaming:   ${colorize('green', 'Supported')}`)
  } else {
    console.log(`  Streaming:   ${colorize('yellow', 'Not Supported (or not specified)')}`)
  }

  const supportsExtension = card.capabilities?.extensions?.some((ext) => ext.uri === IN_TASK_OID4VP_EXTENSION_URI)
  console.log(
    `  OID4VP Auth: ${supportsExtension ? colorize('green', 'Advertised') : colorize('yellow', 'Not advertised')}`
  )
}

function printMessageContent(message: Message) {
  message.parts.forEach((part: Part, index: number) => {
    const partPrefix = colorize('red', `  Part ${index + 1}:`)

    switch (part.content?.$case) {
      case 'text':
        console.log(`${partPrefix} ${colorize('green', '📝 Text:')}`, part.content.value)
        break
      case 'data':
        console.log(`${partPrefix} ${colorize('yellow', '📊 Data:')}`, JSON.stringify(part.content.value, null, 2))
        break
      case 'raw':
        console.log(
          `${partPrefix} ${colorize('blue', '📄 File:')} Name: ${part.filename || 'N/A'}, Type: ${
            part.mediaType || 'N/A'
          }, Source: Inline (bytes)`
        )
        break
      case 'url':
        console.log(
          `${partPrefix} ${colorize('blue', '📄 File:')} Name: ${part.filename || 'N/A'}, Type: ${
            part.mediaType || 'N/A'
          }, Source: ${part.content.value}`
        )
        break
      default:
        console.log(`${partPrefix} ${colorize('yellow', 'Unsupported part kind:')}`, part)
    }
  })
}

const STATE_EMOJI: Partial<Record<TaskState, string>> = {
  [TaskState.TASK_STATE_WORKING]: '⏳',
  [TaskState.TASK_STATE_INPUT_REQUIRED]: '🤔',
  [TaskState.TASK_STATE_AUTH_REQUIRED]: '🔐',
  [TaskState.TASK_STATE_COMPLETED]: '✅',
  [TaskState.TASK_STATE_CANCELED]: '⏹️',
  [TaskState.TASK_STATE_FAILED]: '❌',
}

function stateLabel(state: TaskState): string {
  return taskStateToJSON(state)
    .replace(/^TASK_STATE_/, '')
    .toLowerCase()
    .replace(/_/g, '-')
}

function printStatusUpdate(event: TaskStatusUpdateEvent) {
  const timestamp = new Date().toLocaleTimeString()
  const prefix = colorize('magenta', `\n${agentName} [${timestamp}]:`)
  const state = event.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED
  const emoji = STATE_EMOJI[state] ?? 'ℹ️'
  const isFinal = TERMINAL_TASK_STATES.has(state)

  console.log(
    `${prefix} ${emoji} Status: ${colorize('cyan', stateLabel(state))} (Task: ${event.taskId}, Context: ${
      event.contextId
    }) ${isFinal ? colorize('bright', '[FINAL]') : ''}`
  )

  if (event.status?.message) {
    printMessageContent(event.status.message)
  }
}

function printArtifactUpdate(event: TaskArtifactUpdateEvent) {
  const timestamp = new Date().toLocaleTimeString()
  const prefix = colorize('magenta', `\n${agentName} [${timestamp}]:`)

  console.log(
    `${prefix} 📄 Artifact Received: ${event.artifact?.name || '(unnamed)'} (ID: ${
      event.artifact?.artifactId
    }, Task: ${event.taskId}, Context: ${event.contextId})`
  )
  printMessageContent({
    messageId: uuid(),
    contextId: event.contextId,
    taskId: event.taskId,
    role: Role.ROLE_AGENT,
    parts: event.artifact?.parts ?? [],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  })
}

async function createAndProvisionCredoAgent(): Promise<{
  credoAgent: CredoAgentWithDidComm
  holderConnectionRecord: DidCommConnectionRecord
}> {
  const credoAgent = createCredoAgent('a2a-client', CLI_CLIENT_PORT)

  await credoAgent.initialize()

  // TODO: Use actual DID Exchange to create a connection after updating Credo to 0.6.0+ in Heka Wallet
  // const { connectionRecord: holderConnectionRecord } = await credoAgent.didcomm.oob.receiveInvitationFromUrl(
  //   HOLDER_INVITATION_URL,
  //   {
  //     label: 'holder',
  //   }
  // )

  const connectionsRepository = credoAgent.dependencyManager.resolve(DidCommConnectionRepository)

  const { didState } = await credoAgent.dids.create({
    method: 'key',
    options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
  })

  const holderConnectionRecord = new DidCommConnectionRecord({
    role: DidCommDidExchangeRole.Requester,
    state: DidCommDidExchangeState.Completed,
    theirDid: HOLDER_PUBLIC_DID,
    did: didState.didDocument.id,
  })

  await connectionsRepository.save(credoAgent.context, holderConnectionRecord)

  return { credoAgent, holderConnectionRecord }
}

function confirmAction(description: string): Promise<boolean> {
  // A closed stdin resolves to null, which counts as "not confirmed".
  return question(`${description}\nPlease confirm the action (yes / no): `).then(
    (answer) => answer?.trim().toLowerCase() === 'yes'
  )
}

async function handleAuthRequest(
  credoAgent: CredoAgentWithDidComm,
  holderConnectionRecord: DidCommConnectionRecord,
  event: TaskStatusUpdateEvent
): Promise<boolean> {
  const extensionMetadata = event.status?.message?.metadata?.[IN_TASK_OID4VP_EXTENSION_URI] as
    | InTaskOpenId4VpMessageMetadata
    | undefined

  if (!extensionMetadata?.authorizationRequest) {
    console.log(
      colorize(
        'yellow',
        "Received 'auth-required' state, but no OID4VP In-Task Auth metadata is found in the event. Skipping..."
      )
    )
    return false
  }

  const { authorizationRequest } = extensionMetadata

  // The spec allows an inline `request` object instead of `request_uri`
  // This demo only implements the `request_uri` variant
  if (!authorizationRequest.request_uri) {
    console.log(
      colorize(
        'yellow',
        'The agent sent an inline `request` object, but this demo only supports the `request_uri` variant. Skipping...'
      )
    )
    return false
  }

  console.log(colorize('green', `Agent requested additional authorization.`))

  const isWalletInvocationConfirmed = await confirmAction(`Invoke mobile wallet to proceed with authentication?`)

  if (!isWalletInvocationConfirmed) {
    console.log(colorize('red', 'Authorization cancelled - unable to proceed with the task.'))
    return false
  }

  await credoAgent.didcomm.basicMessages.sendMessage(holderConnectionRecord.id, authorizationRequest.request_uri)

  console.log(colorize('dim', 'Authorization request sent to the wallet. Waiting for the agent to verify it...'))

  return true
}

async function sendMessage(
  credoAgent: CredoAgentWithDidComm,
  holderConnectionRecord: DidCommConnectionRecord,
  text: string
): Promise<void> {
  const message: Message = {
    messageId: uuid(),
    contextId: currentContextId ?? '',
    taskId: currentTaskId ?? '',
    role: Role.ROLE_USER,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [IN_TASK_OID4VP_EXTENSION_URI],
    referenceTaskIds: [],
  }

  const params: SendMessageRequest = {
    tenant: '',
    message,
    configuration: undefined,
    metadata: undefined,
  }

  console.log(colorize('red', 'Sending message...'))
  const stream = client.sendMessageStream(params)

  for await (const response of stream) {
    const payload = response.payload
    if (!payload) continue

    if (payload.$case === 'statusUpdate') {
      const statusEvent = payload.value
      printStatusUpdate(statusEvent)

      const state = statusEvent.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED

      if (state === TaskState.TASK_STATE_AUTH_REQUIRED) {
        const requestSentToWallet = await handleAuthRequest(credoAgent, holderConnectionRecord, statusEvent)
        if (!requestSentToWallet) {
          // The agent cannot be told out of band that we declined, so it moves on only
          // after its own auth timeout. Abandon this turn and start the next one fresh.
          currentTaskId = undefined
          currentContextId = undefined
          console.log(colorize('dim', '--- Authorization not completed; returning to the prompt. ---'))
          return
        }
      }

      if (TERMINAL_TASK_STATES.has(state)) {
        console.log(colorize('yellow', `   Task ${statusEvent.taskId} is final. Clearing current task ID.`))
        currentTaskId = undefined
      }
    } else if (payload.$case === 'artifactUpdate') {
      printArtifactUpdate(payload.value)
    } else if (payload.$case === 'task') {
      const task: Task = payload.value
      const timestamp = new Date().toLocaleTimeString()
      console.log(
        `${colorize('magenta', `\n${agentName} [${timestamp}]:`)} ${colorize('blue', 'ℹ️ Task Stream Event:')} ID: ${
          task.id
        }, Context: ${task.contextId}, Status: ${stateLabel(task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED)}`
      )
      currentTaskId = task.id
      currentContextId = task.contextId
      if (task.status?.message) {
        console.log(colorize('gray', '   Task includes message:'))
        printMessageContent(task.status.message)
      }
      if (task.artifacts && task.artifacts.length > 0) {
        console.log(colorize('gray', `   Task includes ${task.artifacts.length} artifact(s).`))
      }
    } else if (payload.$case === 'message') {
      const msg: Message = payload.value
      const timestamp = new Date().toLocaleTimeString()
      console.log(
        `${colorize('magenta', `\n${agentName} [${timestamp}]:`)} ${colorize('green', '✉️ Message Stream Event:')}`
      )
      printMessageContent(msg)
      if (msg.taskId) currentTaskId = msg.taskId
      if (msg.contextId) currentContextId = msg.contextId
    }
  }
  console.log(colorize('dim', `--- End of response stream for this input ---`))
}

async function main() {
  console.log(colorize('bright', `A2A Terminal Client`))
  console.log(colorize('dim', `Agent Base URL: ${serverUrl}`))

  const { credoAgent, holderConnectionRecord } = await createAndProvisionCredoAgent()

  try {
    const agentCard = await createClient()
    displayAgentCard(agentCard)
  } catch (error) {
    const detail = error instanceof Error ? error.message : error
    console.log(colorize('yellow', `⚠️ Could not connect to ${serverUrl} (is the agent running?): ${detail}`))
    rl.close()
    await credoAgent.shutdown()
    process.exit(1)
  }

  console.log(
    colorize('dim', `No active task or context initially. Use '/new' to start a fresh session or send a message.`)
  )
  console.log(colorize('green', `Enter messages, or use '/new' to start a new session. '/exit' to quit.`))

  for (;;) {
    const answer = await question(colorize('cyan', `\n${agentName} > You: `))

    if (answer === null) break // stdin closed

    const input = answer.trim()

    if (!input) continue

    if (input.toLowerCase() === '/exit') break

    if (input.toLowerCase() === '/new') {
      currentTaskId = undefined
      currentContextId = undefined
      console.log(colorize('bright', `✨ Starting new session. Task and Context IDs are cleared.`))
      continue
    }

    try {
      await sendMessage(credoAgent, holderConnectionRecord, input)
    } catch (error: any) {
      const timestamp = new Date().toLocaleTimeString()
      const prefix = colorize('red', `\n${agentName} [${timestamp}] ERROR:`)
      console.error(prefix, `Error communicating with agent:`, error.message || error)
      if (error.code) {
        console.error(colorize('gray', `   Code: ${error.code}`))
      }
      if (error.data) {
        console.error(colorize('gray', `   Data: ${JSON.stringify(error.data)}`))
      }
      if (!(error.code || error.data) && error.stack) {
        console.error(colorize('gray', error.stack.split('\n').slice(1, 3).join('\n')))
      }
    }
  }

  rl.close()
  await credoAgent.shutdown()
  console.log(colorize('yellow', '\nExiting A2A Terminal Client. Goodbye!'))
  process.exit(0)
}

main().catch((err) => {
  console.error(colorize('red', 'Unhandled error in main:'), err)
  process.exit(1)
})
