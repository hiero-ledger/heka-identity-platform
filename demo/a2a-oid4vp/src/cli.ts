#!/usr/bin/env node

import readline from 'node:readline'
import crypto from 'node:crypto'

import {
  AgentCard,
  DataPart,
  FilePart,
  Message,
  MessageSendParams,
  Part,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from '@a2a-js/sdk'
import { A2AClient } from '@a2a-js/sdk/client'
import { createCredoAgent, CredoAgentWithDidComm } from './credo-helpers'
import { IN_TASK_OID4VP_EXTENSION_URI, InTaskOpenId4VpMessageMetadata } from './a2a-oid4vp-extension'
import * as dotenv from 'dotenv'
import {
  DidCommConnectionRecord,
  DidCommConnectionRepository,
  DidCommDidExchangeRole,
  DidCommDidExchangeState,
} from '@credo-ts/didcomm'

dotenv.config()

if (!process.env.HOLDER_PUBLIC_DID) {
  throw new Error('HOLDER_PUBLIC_DID environment variable is not set.')
}

// TODO: Switch to 'HOLDER_INVITATION_URL' usage after updating Heka Wallet to Credo 0.6.0+
// if (!process.env.HOLDER_INVITATION_URL) {
//   throw new Error('HOLDER_INVITATION_URL environment variable is not set.')
// }

const CLI_CLIENT_PORT = !Number.isNaN(parseInt(process.env.CLI_CLIENT_PORT))
  ? parseInt(process.env.CLI_CLIENT_PORT)
  : 3010

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

function generateId(): string {
  return crypto.randomUUID()
}

let currentTaskId: string | undefined = undefined
let currentContextId: string | undefined = undefined

const DEMO_AGENT_PORT = process.env.DEMO_AGENT_PORT ?? 10003

const serverUrl = `http://localhost:${DEMO_AGENT_PORT}`
const client = new A2AClient(serverUrl)

let agentName = 'Agent' // Default, try to get from agent card later

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: colorize('cyan', 'You: '),
})

function printAgentEvent(event: TaskStatusUpdateEvent | TaskArtifactUpdateEvent) {
  const timestamp = new Date().toLocaleTimeString()
  const prefix = colorize('magenta', `\n${agentName} [${timestamp}]:`)

  // Check if it's a TaskStatusUpdateEvent
  if (event.kind === 'status-update') {
    const state = event.status.state
    let stateEmoji: string
    let stateColor: keyof typeof colors

    switch (state) {
      case 'working':
        stateEmoji = '⏳'
        stateColor = 'blue'
        break
      case 'input-required':
        stateEmoji = '🤔'
        stateColor = 'yellow'
        break
      case 'completed':
        stateEmoji = '✅'
        stateColor = 'green'
        break
      case 'canceled':
        stateEmoji = '⏹️'
        stateColor = 'gray'
        break
      case 'failed':
        stateEmoji = '❌'
        stateColor = 'red'
        break
      default:
        stateEmoji = 'ℹ️' // For other states like submitted, rejected etc.
        stateColor = 'dim'
        break
    }

    console.log(
      `${prefix} ${stateEmoji} Status: ${colorize(stateColor, state)} (Task: ${event.taskId}, Context: ${event.contextId}) ${event.final ? colorize('bright', '[FINAL]') : ''}`
    )

    if (event.status.message) {
      printMessageContent(event.status.message)
    }
  } else if (event.kind === 'artifact-update') {
    console.log(
      `${prefix} 📄 Artifact Received: ${
        event.artifact.name || '(unnamed)'
      } (ID: ${event.artifact.artifactId}, Task: ${event.taskId}, Context: ${event.contextId})`
    )
    printMessageContent({
      messageId: generateId(),
      kind: 'message',
      role: 'agent', // Assuming artifact parts are from agent
      parts: event.artifact.parts,
      taskId: event.taskId,
      contextId: event.contextId,
    })
  } else {
    console.log(prefix, colorize('yellow', 'Received unknown event type in printAgentEvent:'), event)
  }
}

function printMessageContent(message: Message) {
  message.parts.forEach((part: Part, index: number) => {
    const partPrefix = colorize('red', `  Part ${index + 1}:`)

    if (part.kind === 'text') {
      console.log(`${partPrefix} ${colorize('green', '📝 Text:')}`, part.text)
    } else if (part.kind === 'file') {
      const filePart = part as FilePart
      console.log(
        `${partPrefix} ${colorize('blue', '📄 File:')} Name: ${
          filePart.file.name || 'N/A'
        }, Type: ${filePart.file.mimeType || 'N/A'}, Source: ${
          'bytes' in filePart.file ? 'Inline (bytes)' : filePart.file.uri
        }`
      )
    } else if (part.kind === 'data') {
      const dataPart = part as DataPart
      console.log(`${partPrefix} ${colorize('yellow', '📊 Data:')}`, JSON.stringify(dataPart.data, null, 2))
    } else {
      console.log(`${partPrefix} ${colorize('yellow', 'Unsupported part kind:')}`, part)
    }
  })
}

async function fetchAndDisplayAgentCard() {
  console.log(colorize('dim', `Attempting to fetch agent card from agent at: ${serverUrl}`))

  try {
    const card: AgentCard = await client.getAgentCard()
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
  } catch (error: any) {
    console.log(colorize('yellow', `⚠️ Error fetching or parsing agent card`))
    throw error
  }
}

async function createAndProvisionCredoAgent(): Promise<{
  credoAgent: CredoAgentWithDidComm
  holderConnectionRecord: DidCommConnectionRecord
}> {
  const credoAgent = createCredoAgent('a2a-client', CLI_CLIENT_PORT)

  await credoAgent.initialize()

  // TODO: Use actual DID Exchange to create a connection after updating Credo to 0.6.0+ in Heka Wallet
  // const { connectionRecord: holderConnectionRecord } = await credoAgent.didcomm.oob.receiveInvitationFromUrl(
  //   process.env.HOLDER_INVITATION_URL,
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
    theirDid: process.env.HOLDER_PUBLIC_DID,
    did: didState.didDocument.id,
  })

  await connectionsRepository.save(credoAgent.context, holderConnectionRecord)

  return { credoAgent, holderConnectionRecord }
}

function confirmAction(rl: readline.Interface, description: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${description}\nPlease confirm the action (yes / no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes')
    })
  })
}

async function main() {
  console.log(colorize('bright', `A2A Terminal Client`))
  console.log(colorize('dim', `Agent Base URL: ${serverUrl}`))

  const { credoAgent, holderConnectionRecord } = await createAndProvisionCredoAgent()

  // Fetch the agent card before starting the loop
  await fetchAndDisplayAgentCard()

  console.log(
    colorize('dim', `No active task or context initially. Use '/new' to start a fresh session or send a message.`)
  )
  console.log(colorize('green', `Enter messages, or use '/new' to start a new session. '/exit' to quit.`))

  rl.setPrompt(colorize('cyan', `${agentName} > You: `))
  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    rl.setPrompt(colorize('cyan', `${agentName} > You: `))

    if (!input) {
      rl.prompt()
      return
    }

    if (input.toLowerCase() === '/new') {
      currentTaskId = undefined
      currentContextId = undefined
      console.log(colorize('bright', `✨ Starting new session. Task and Context IDs are cleared.`))
      rl.prompt()
      return
    }

    if (input.toLowerCase() === '/exit') {
      rl.close()
      return
    }

    const messageId = generateId()

    const messagePayload: Message = {
      messageId,
      kind: 'message',
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: input,
        },
      ],
    }

    if (currentTaskId) {
      messagePayload.taskId = currentTaskId
    }

    if (currentContextId) {
      messagePayload.contextId = currentContextId
    }

    const params: MessageSendParams = {
      message: messagePayload,
      // Optional: configuration for streaming, blocking, etc.
      // configuration: {
      //   acceptedOutputModes: ['text/plain', 'application/json'], // Example
      //   blocking: false // Default for streaming is usually non-blocking
      // }
    }

    try {
      console.log(colorize('red', 'Sending message...'))
      const stream = client.sendMessageStream(params)

      for await (const event of stream) {
        const timestamp = new Date().toLocaleTimeString()
        const prefix = colorize('magenta', `\n${agentName} [${timestamp}]:`)

        if (event.kind === 'status-update') {
          const typedEvent = event as TaskStatusUpdateEvent
          printAgentEvent(typedEvent)

          if (typedEvent.status.state === 'auth-required') {
            const extensionMetadata = typedEvent.status.message.metadata[
              IN_TASK_OID4VP_EXTENSION_URI
            ] as InTaskOpenId4VpMessageMetadata
            if (!extensionMetadata) {
              console.log(
                colorize(
                  'yellow',
                  "Received 'auth-required' state, but no OID4VP In-Task Auth metadata is found in the event. Skipping..."
                )
              )
            }

            console.log(colorize('green', `Agent requested additional authorization.`))

            const isWalletInvocationConfirmed = await confirmAction(
              rl,
              `Invoke mobile wallet to proceed with authentication?`
            )

            if (isWalletInvocationConfirmed) {
              await credoAgent.didcomm.basicMessages.sendMessage(
                holderConnectionRecord.id,
                extensionMetadata.authorizationRequest.request_uri
              )
            } else {
              console.log(colorize('red', 'Authorization cancelled - unable to proceed with the task.'))
            }
          }

          // If the event is a TaskStatusUpdateEvent and it's final, reset currentTaskId
          if (typedEvent.status.state !== 'input-required' && typedEvent.final) {
            console.log(colorize('yellow', `   Task ${typedEvent.taskId} is final. Clearing current task ID.`))
            currentTaskId = undefined
            // Optionally, you might want to clear currentContextId as well if a task ending implies context ending.
            // currentContextId = undefined;
            // console.log(colorize("dim", `   Context ID also cleared as task is final.`));
          }
        } else if (event.kind === 'message') {
          const msg = event as Message
          console.log(`${prefix} ${colorize('green', '✉️ Message Stream Event:')}`)
          printMessageContent(msg)
          if (msg.taskId && msg.taskId !== currentTaskId) {
            console.log(colorize('dim', `   Task ID context updated to ${msg.taskId} based on message event.`))
            currentTaskId = msg.taskId
          }
          if (msg.contextId && msg.contextId !== currentContextId) {
            console.log(colorize('dim', `   Context ID updated to ${msg.contextId} based on message event.`))
            currentContextId = msg.contextId
          }
        } else if (event.kind === 'task') {
          const task = event as Task
          console.log(
            `${prefix} ${colorize('blue', 'ℹ️ Task Stream Event:')} ID: ${task.id}, Context: ${task.contextId}, Status: ${task.status.state}`
          )
          if (task.id !== currentTaskId) {
            console.log(colorize('dim', `   Task ID updated from ${currentTaskId || 'N/A'} to ${task.id}`))
            currentTaskId = task.id
          }
          if (task.contextId && task.contextId !== currentContextId) {
            console.log(colorize('dim', `   Context ID updated from ${currentContextId || 'N/A'} to ${task.contextId}`))
            currentContextId = task.contextId
          }
          if (task.status.message) {
            console.log(colorize('gray', '   Task includes message:'))
            printMessageContent(task.status.message)
          }
          if (task.artifacts && task.artifacts.length > 0) {
            console.log(colorize('gray', `   Task includes ${task.artifacts.length} artifact(s).`))
          }
        } else {
          console.log(prefix, colorize('yellow', 'Received unknown event structure from stream:'), event)
        }
      }
      console.log(colorize('dim', `--- End of response stream for this input ---`))
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
    } finally {
      rl.prompt()
    }
  }).on('close', () => {
    console.log(colorize('yellow', '\nExiting A2A Terminal Client. Goodbye!'))
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(colorize('red', 'Unhandled error in main:'), err)
  process.exit(1)
})
