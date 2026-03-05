import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { AgentCard, Message, TaskStatusUpdateEvent, TextPart } from '@a2a-js/sdk'
import {
  AgentExecutor,
  DefaultRequestHandler,
  ExecutionEventBus,
  InMemoryTaskStore,
  RequestContext,
  TaskStore,
} from '@a2a-js/sdk/server'
import { A2AExpressApp } from '@a2a-js/sdk/server/express'
import { MessageData } from 'genkit'
import { ai } from './genkit.js'

import * as dotenv from 'dotenv'
import {
  IN_TASK_OID4VP_EXTENSION_URI,
  InTaskOpenId4VpAuthorizationRequest,
  InTaskOpenId4VpExtension,
  InTaskOpenId4VpMessageMetadata,
} from '../a2a-oid4vp-extension'
import axios from 'axios'
import { WebSocket } from 'ws'

dotenv.config()

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.')
}

if (!process.env.IDENTITY_SERVICE_ACCESS_TOKEN || !process.env.IDENTITY_SERVICE_URL) {
  throw new Error(
    'Identity Service env environment variables are not set (IDENTITY_SERVICE_ACCESS_TOKEN and IDENTITY_SERVICE_URL).'
  )
}

const DEMO_AGENT_PORT = process.env.DEMO_AGENT_PORT ?? 10003

const DEMO_AGENT_CARD: AgentCard = {
  name: 'Demo Agent',
  description: 'A demo agent that can answer questions about decentralized identity.',
  url: `http://localhost:${DEMO_AGENT_PORT}/`,
  provider: {
    organization: 'Heka Identity Platform',
    url: 'https://github.com/hiero-ledger/heka-identity-platform',
  },
  version: '1.0.0',
  protocolVersion: '1.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: false,
    extensions: [
      {
        uri: IN_TASK_OID4VP_EXTENSION_URI,
        description:
          'Provides an option to use OpenID for Verifiable Presentations (OID4VP) for In-Task Authentication',
        required: false,
        params: { oid4vpVersions: ['1.0'] },
      } satisfies InTaskOpenId4VpExtension,
    ],
  },
  securitySchemes: undefined,
  security: undefined,
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'assistant',
      name: 'Advising on decentralized identity',
      description: 'Answers questions about decentralized identity',
      tags: ['assistant'],
      examples: ['What is Verifiable Credential?', 'What is Decentralized Identity?'],
      inputModes: ['text'],
      outputModes: ['text'],
    },
  ],
  supportsAuthenticatedExtendedCard: false,
}

const demoAgentPrompt = ai.prompt('demo_agent')

const PEX_DEFINITION = {
  id: 'ExampleCredential',
  name: 'Example Credential Presentation Definition',
  input_descriptors: [
    {
      id: 'ExampleCredential',
      name: 'SD-JWT Example Credential',
      purpose: 'To perform A2A In-Task authentication',
      constraints: {
        limit_disclosure: 'required',
        fields: [
          {
            path: ['$.vct'],
            filter: {
              type: 'string',
              enum: ['ExampleCredential'],
            },
          },
          {
            path: ['$.name'],
            filter: {
              type: 'string',
            },
          },
        ],
      },
    },
  ],
}

const IDENTITY_SERVICE_AUTHORIZATION_HEADER = `Bearer ${process.env.IDENTITY_SERVICE_ACCESS_TOKEN}`

class DemoAgentExecutor implements AgentExecutor {
  private readonly cancelledTasks = new Set<string>()
  private readonly authorizedContexts = new Set<string>()

  private readonly verificationSessionContextMap = new Map<string, string>()

  private readonly identityServiceApi = axios.create({
    baseURL: process.env.IDENTITY_SERVICE_URL,
    headers: { Authorization: IDENTITY_SERVICE_AUTHORIZATION_HEADER },
  })

  private readonly notificationWebSocket = new WebSocket(
    `${process.env.IDENTITY_SERVICE_URL.replace('http', 'ws')}/notifications`,
    {
      headers: { Authorization: IDENTITY_SERVICE_AUTHORIZATION_HEADER },
    }
  )

  private verifierDid: string | null = null

  public async initialize(): Promise<void> {
    const prepareWalletResponse = await this.identityServiceApi.post('/prepare-wallet')

    this.verifierDid = prepareWalletResponse.data.did
  }

  public cancelTask = async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    this.cancelledTasks.add(taskId)
  }

  public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = requestContext.userMessage
    let task = requestContext.task

    const taskId = task?.id || uuidv4()
    const contextId = userMessage.contextId || task?.contextId || uuidv4()

    console.log(
      `[DemoAgentExecutor] Processing message ${userMessage.messageId} for task ${taskId} (context: ${contextId})`
    )

    if (!task) {
      task = {
        kind: 'task',
        id: taskId,
        contextId,
        status: {
          state: 'submitted',
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
        metadata: userMessage.metadata,
      }
      eventBus.publish(task)
    }

    if (!this.authorizedContexts.has(contextId)) {
      const authorizationRequest = await this.createAuthorizationRequestForContext(contextId)

      const authRequiredStatusUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'auth-required',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: uuidv4(),
            parts: [{ kind: 'text', text: 'Additional authorization is required for this task.' }],
            taskId,
            contextId,
            metadata: {
              [IN_TASK_OID4VP_EXTENSION_URI]: {
                authorizationRequest,
              } satisfies InTaskOpenId4VpMessageMetadata,
            },
          },
          timestamp: new Date().toISOString(),
        },
        final: false,
      }

      eventBus.publish(authRequiredStatusUpdate)
      await this.waitForContextAuthorization(contextId)
    }

    const workingStatusUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      status: {
        state: 'working',
        message: {
          kind: 'message',
          role: 'agent',
          messageId: uuidv4(),
          parts: [{ kind: 'text', text: 'Thinking...' }],
          taskId,
          contextId,
        },
        timestamp: new Date().toISOString(),
      },
      final: false,
    }
    eventBus.publish(workingStatusUpdate)

    const historyForGenkit = task?.history ? [...task.history] : []
    if (!historyForGenkit.find((m) => m.messageId === userMessage.messageId)) {
      historyForGenkit.push(userMessage)
    }

    const messages: MessageData[] = historyForGenkit
      .map((message) => ({
        role: (message.role === 'agent' ? 'model' : 'user') as 'user' | 'model',
        content: message.parts
          .filter((part): part is TextPart => part.kind === 'text' && !!part.text)
          .map((part) => ({
            text: part.text,
          })),
      }))
      .filter((message) => message.content.length > 0)

    if (messages.length === 0) {
      console.warn(`[DemoAgentExecutor] No valid text messages found in history for task ${taskId}.`)
      const failureUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: uuidv4(),
            parts: [{ kind: 'text', text: 'No messages found to process.' }],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      }
      eventBus.publish(failureUpdate)
      return
    }

    try {
      const response = await demoAgentPrompt(
        {},
        {
          messages,
        }
      )

      if (this.cancelledTasks.has(taskId)) {
        console.log(`[DemoAgentExecutor] Request cancelled for task: ${taskId}`)

        const cancelledUpdate: TaskStatusUpdateEvent = {
          kind: 'status-update',
          taskId,
          contextId,
          status: {
            state: 'canceled',
            timestamp: new Date().toISOString(),
          },
          final: true,
        }
        eventBus.publish(cancelledUpdate)
        return
      }

      const responseText = response.text
      console.info(`[DemoAgentExecutor] Prompt response: ${responseText}`)

      const agentMessage: Message = {
        kind: 'message',
        role: 'agent',
        messageId: uuidv4(),
        parts: [{ kind: 'text', text: responseText || 'Completed.' }],
        taskId,
        contextId,
      }

      const finalUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'completed',
          message: agentMessage,
          timestamp: new Date().toISOString(),
        },
        final: true,
      }
      eventBus.publish(finalUpdate)

      console.log(`[DemoAgentExecutor] Task ${taskId} finished with state: completed`)
    } catch (error: unknown) {
      console.error(`[DemoAgentExecutor] Error processing task ${taskId}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      const errorUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: uuidv4(),
            parts: [{ kind: 'text', text: `Agent error: ${errorMessage}` }],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      }
      eventBus.publish(errorUpdate)
    }
  }

  private async createAuthorizationRequestForContext(contextId: string): Promise<InTaskOpenId4VpAuthorizationRequest> {
    const verificationSessionResponse = await this.identityServiceApi.post('/openid4vc/verification-session/request', {
      publicVerifierId: this.verifierDid,
      requestSigner: {
        method: 'did',
        did: this.verifierDid,
      },
      presentationExchange: {
        definition: PEX_DEFINITION,
      },
    })

    const { verificationSession, authorizationRequest: request_uri } = verificationSessionResponse.data

    this.verificationSessionContextMap.set(verificationSession.id, contextId)

    return { request_uri, client_id: 'demo-client-id' }
  }

  private async waitForContextAuthorization(contextId: string, timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => reject('Authorization timeout exceeded.'), timeoutMs)
      this.notificationWebSocket.on('message', (notificationMessageData: Buffer) => {
        const notificationMessage = JSON.parse(notificationMessageData.toString())
        const { type, verificationSession } = notificationMessage

        if (
          type !== 'OpenId4VcVerifier.VerificationSessionStateChanged' ||
          verificationSession?.state !== 'ResponseVerified'
        ) {
          return
        }

        if (this.verificationSessionContextMap.get(verificationSession.id) === contextId) {
          this.authorizedContexts.add(contextId)
          resolve()
        }
      })
    })
  }
}

async function main() {
  const taskStore: TaskStore = new InMemoryTaskStore()
  const agentExecutor: DemoAgentExecutor = new DemoAgentExecutor()

  await agentExecutor.initialize()

  const requestHandler = new DefaultRequestHandler(DEMO_AGENT_CARD, taskStore, agentExecutor)

  const appBuilder = new A2AExpressApp(requestHandler)
  const expressApp = appBuilder.setupRoutes(express())

  expressApp.listen(DEMO_AGENT_PORT, () => {
    console.log(`[DemoAgent] Server using new framework started on http://localhost:${DEMO_AGENT_PORT}`)
    console.log(`[DemoAgent] Agent Card: http://localhost:${DEMO_AGENT_PORT}/.well-known/agent-card.json`)
    console.log('[DemoAgent] Press Ctrl+C to stop the server')
  })
}

main().catch(console.error)
