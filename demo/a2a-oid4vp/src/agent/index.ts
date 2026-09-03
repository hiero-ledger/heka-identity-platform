import express from 'express'
import { A2A_PROTOCOL_VERSION, AGENT_CARD_PATH, AgentCard, Role, Task, TaskState } from '@a2a-js/sdk'
import {
  AgentEvent,
  AgentExecutor,
  DefaultExecutionEventBusManager,
  DefaultRequestHandler,
  ExecutionEventBus,
  InMemoryTaskStore,
  RequestContext,
  TaskStore,
} from '@a2a-js/sdk/server'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { MessageData } from 'genkit'
import { ai } from './genkit.js'

import * as dotenv from 'dotenv'
import {
  IN_TASK_OID4VP_EXTENSION_URI,
  InTaskOpenId4VpAuthorizationRequest,
  InTaskOpenId4VpExtension,
  InTaskOpenId4VpMessageMetadata,
} from '../a2a-oid4vp-extension'
import { agentText, bindOrExit, partsToText, requireEnv, statusEvent, textPart, uuid } from '../a2a-helpers'
import axios from 'axios'
import { WebSocket } from 'ws'

dotenv.config()

requireEnv('OPENAI_API_KEY')

const IDENTITY_SERVICE_URL = requireEnv('IDENTITY_SERVICE_URL')
const IDENTITY_SERVICE_ACCESS_TOKEN = requireEnv('IDENTITY_SERVICE_ACCESS_TOKEN')

const DEMO_AGENT_PORT = Number(process.env.DEMO_AGENT_PORT) || 10003

// How long the agent waits for the user to present a credential from the wallet before failing the task
const AUTH_TIMEOUT_MS = Number(process.env.DEMO_AGENT_AUTH_TIMEOUT_MS) || 120000

const DEMO_AGENT_CARD: AgentCard = {
  name: 'Demo Agent',
  description: 'A demo agent that can answer questions about decentralized identity.',
  supportedInterfaces: [
    {
      protocolBinding: 'JSONRPC',
      protocolVersion: A2A_PROTOCOL_VERSION,
      url: `http://localhost:${DEMO_AGENT_PORT}/`,
      tenant: '',
    },
  ],
  provider: {
    organization: 'Heka Identity Platform',
    url: 'https://github.com/hiero-ledger/heka-identity-platform',
  },
  version: '1.0.0',
  capabilities: {
    streaming: true,
    pushNotifications: false,
    extendedAgentCard: false,
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
      securityRequirements: [],
    },
  ],
  securitySchemes: {},
  securityRequirements: [],
  signatures: [],
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

const IDENTITY_SERVICE_AUTHORIZATION_HEADER = `Bearer ${IDENTITY_SERVICE_ACCESS_TOKEN}`

class DemoAgentExecutor implements AgentExecutor {
  private readonly cancelledTasks = new Set<string>()
  private readonly authorizedContexts = new Set<string>()
  private readonly authWaiters = new Map<string, () => void>()

  private readonly verificationSessionContextMap = new Map<string, string>()

  private readonly identityServiceApi = axios.create({
    baseURL: IDENTITY_SERVICE_URL,
    headers: { Authorization: IDENTITY_SERVICE_AUTHORIZATION_HEADER },
  })

  private notificationWebSocket: WebSocket | null = null

  private verifierDid: string | null = null

  public async initialize(): Promise<void> {
    const prepareWalletResponse = await this.identityServiceApi.post('/prepare-wallet')

    this.verifierDid = prepareWalletResponse.data.did

    this.notificationWebSocket = new WebSocket(`${IDENTITY_SERVICE_URL.replace('http', 'ws')}/notifications`, {
      headers: { Authorization: IDENTITY_SERVICE_AUTHORIZATION_HEADER },
    })

    this.notificationWebSocket.on('message', this.onIdentityServiceNotification.bind(this))
    this.notificationWebSocket.on('error', (error) => {
      console.error('[DemoAgentExecutor] Identity Service notification socket error:', error)
    })
  }

  public cancelTask = async (taskId: string): Promise<void> => {
    this.cancelledTasks.add(taskId)
  }

  public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = requestContext.userMessage
    const existingTask = requestContext.task

    const taskId = requestContext.taskId
    const contextId = requestContext.contextId

    console.log(
      `[DemoAgentExecutor] Processing message ${userMessage.messageId} for task ${taskId} (context: ${contextId})`
    )

    if (requestContext.context.requestedExtensions?.includes(IN_TASK_OID4VP_EXTENSION_URI)) {
      requestContext.context.addActivatedExtension(IN_TASK_OID4VP_EXTENSION_URI)
    } else {
      console.warn(
        `[DemoAgentExecutor] Client did not request ${IN_TASK_OID4VP_EXTENSION_URI}, so it will not understand the authorization request.`
      )
    }

    const task: Task = existingTask ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        message: undefined,
        timestamp: new Date().toISOString(),
      },
      artifacts: [],
      history: [userMessage],
      metadata: userMessage.metadata,
    }
    eventBus.publish(AgentEvent.task(task))

    if (!this.authorizedContexts.has(contextId)) {
      try {
        await this.requestAndAwaitAuthorization(taskId, contextId, eventBus)
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'authorization did not complete'
        console.error(`[DemoAgentExecutor] Authorization failed for context ${contextId}:`, error)
        eventBus.publish(
          AgentEvent.statusUpdate(
            statusEvent(
              taskId,
              contextId,
              TaskState.TASK_STATE_FAILED,
              agentText(taskId, contextId, `Authorization was not completed (${reason}).`)
            )
          )
        )
        return
      }
    }

    eventBus.publish(
      AgentEvent.statusUpdate(
        statusEvent(taskId, contextId, TaskState.TASK_STATE_WORKING, agentText(taskId, contextId, 'Thinking...'))
      )
    )

    const history = existingTask?.history ? [...existingTask.history] : []
    if (!history.some((message) => message.messageId === userMessage.messageId)) {
      history.push(userMessage)
    }

    const messages: MessageData[] = history
      .map((message) => ({
        role: (message.role === Role.ROLE_AGENT ? 'model' : 'user') as 'user' | 'model',
        content: [{ text: partsToText(message.parts) }].filter((part) => part.text.length > 0),
      }))
      .filter((message) => message.content.length > 0)

    if (messages.length === 0) {
      console.warn(`[DemoAgentExecutor] No valid text messages found in history for task ${taskId}.`)
      eventBus.publish(
        AgentEvent.statusUpdate(
          statusEvent(
            taskId,
            contextId,
            TaskState.TASK_STATE_FAILED,
            agentText(taskId, contextId, 'No messages found to process.')
          )
        )
      )
      return
    }

    try {
      const response = await demoAgentPrompt({}, { messages })

      if (this.cancelledTasks.has(taskId)) {
        console.log(`[DemoAgentExecutor] Request cancelled for task: ${taskId}`)
        eventBus.publish(
          AgentEvent.statusUpdate(statusEvent(taskId, contextId, TaskState.TASK_STATE_CANCELED, undefined))
        )
        return
      }

      const responseText = response.text
      console.info(`[DemoAgentExecutor] Prompt response: ${responseText}`)

      eventBus.publish(
        AgentEvent.statusUpdate(
          statusEvent(
            taskId,
            contextId,
            TaskState.TASK_STATE_COMPLETED,
            agentText(taskId, contextId, responseText || 'Completed.')
          )
        )
      )

      console.log(`[DemoAgentExecutor] Task ${taskId} finished with state: completed`)
    } catch (error: unknown) {
      console.error(`[DemoAgentExecutor] Error processing task ${taskId}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      eventBus.publish(
        AgentEvent.statusUpdate(
          statusEvent(
            taskId,
            contextId,
            TaskState.TASK_STATE_FAILED,
            agentText(taskId, contextId, `Agent error: ${errorMessage}`)
          )
        )
      )
    }
  }

  private async requestAndAwaitAuthorization(
    taskId: string,
    contextId: string,
    eventBus: ExecutionEventBus
  ): Promise<void> {
    const authorizationRequest = await this.createAuthorizationRequestForContext(contextId)

    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_AUTH_REQUIRED,
          message: {
            messageId: uuid(),
            contextId,
            taskId,
            role: Role.ROLE_AGENT,
            parts: [textPart('Additional authorization is required for this task.')],
            metadata: {
              [IN_TASK_OID4VP_EXTENSION_URI]: {
                authorizationRequest,
              } satisfies InTaskOpenId4VpMessageMetadata,
            },
            extensions: [IN_TASK_OID4VP_EXTENSION_URI],
            referenceTaskIds: [],
          },
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      })
    )

    await this.waitForContextAuthorization(contextId)
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

  private onIdentityServiceNotification(notificationMessageData: Buffer): void {
    const notificationMessage = JSON.parse(notificationMessageData.toString())
    const { type, verificationSession } = notificationMessage

    if (
      type !== 'OpenId4VcVerifier.VerificationSessionStateChanged' ||
      verificationSession?.state !== 'ResponseVerified'
    ) {
      return
    }

    const contextId = this.verificationSessionContextMap.get(verificationSession.id)
    if (!contextId) return

    this.authorizedContexts.add(contextId)

    const waiter = this.authWaiters.get(contextId)
    if (waiter) {
      this.authWaiters.delete(contextId)
      waiter()
    }
  }

  private waitForContextAuthorization(contextId: string, timeoutMs: number = AUTH_TIMEOUT_MS): Promise<void> {
    if (this.authorizedContexts.has(contextId)) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        // Only clear our own waiter - a newer request for this context may have replaced it.
        if (this.authWaiters.get(contextId) === waiter) this.authWaiters.delete(contextId)
        reject(new Error('authorization timeout exceeded'))
      }, timeoutMs)
      this.authWaiters.set(contextId, waiter)
    })
  }
}

async function main() {
  const taskStore: TaskStore = new InMemoryTaskStore()
  const agentExecutor: DemoAgentExecutor = new DemoAgentExecutor()

  await agentExecutor.initialize()

  const requestHandler = new DefaultRequestHandler(
    DEMO_AGENT_CARD,
    taskStore,
    agentExecutor,
    new DefaultExecutionEventBusManager()
  )

  const expressApp = express()
  expressApp.use(express.json())
  expressApp.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }))
  expressApp.use('/', jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }))

  bindOrExit(expressApp, DEMO_AGENT_PORT, 'DemoAgent', () => {
    console.log(`[DemoAgent] Server started on http://localhost:${DEMO_AGENT_PORT}`)
    console.log(`[DemoAgent] Agent Card: http://localhost:${DEMO_AGENT_PORT}/${AGENT_CARD_PATH}`)
    console.log('[DemoAgent] Press Ctrl+C to stop the server')
  })
}

main().catch(console.error)
