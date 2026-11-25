import {
  OpenId4VcIssuanceSessionRecord,
  OpenId4VcIssuanceSessionState,
  OpenId4VcIssuanceSessionStateChangedEvent,
  OpenId4VcIssuerEvents,
} from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'
import { EntityManager, MikroORM } from '@mikro-orm/core'

import { Agent } from 'common/agent'
import { User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'

import { NotificationEventsListener } from '../notification-events.listener'
import { NotificationService } from '../notification.service'
import { NotificationEvent, NotificationEventType } from '../notification.types'

describe('NotificationEventsListener lifecycle', () => {
  let agent: Agent
  let onSpy: ReturnType<typeof vi.fn>
  let offSpy: ReturnType<typeof vi.fn>
  let notificationService: NotificationService
  let orm: MikroORM
  let em: EntityManager
  let logger: Logger
  let warnSpy: ReturnType<typeof vi.fn>
  let listener: NotificationEventsListener

  beforeEach(() => {
    onSpy = vi.fn()
    offSpy = vi.fn()
    agent = { events: { on: onSpy, off: offSpy } } as unknown as Agent
    notificationService = createMock<NotificationService>()
    orm = createMock<MikroORM>()
    em = createMock<EntityManager>()
    warnSpy = vi.fn()
    logger = createMock<Logger>({ warn: warnSpy })

    listener = new NotificationEventsListener(agent, notificationService, orm, em, logger)
  })

  test('registers and unregisters exact same handler references', () => {
    listener.onModuleInit()

    const onCalls = onSpy.mock.calls
    expect(onCalls.length).toBeGreaterThan(0)

    listener.onModuleDestroy()
    const offCalls = offSpy.mock.calls

    expect(offCalls.length).toBe(onCalls.length)
    for (let i = 0; i < onCalls.length; i++) {
      expect(offCalls[i][0]).toBe(onCalls[i][0])
      expect(offCalls[i][1]).toBe(onCalls[i][1])
    }
  })

  test('does not register duplicate listeners on repeated init', () => {
    listener.onModuleInit()
    const firstInitCount = onSpy.mock.calls.length

    listener.onModuleInit()
    const secondInitCount = onSpy.mock.calls.length

    expect(secondInitCount).toBe(firstInitCount)
    expect(warnSpy).toHaveBeenCalledWith(
      'Notification event listeners are already registered, skipping duplicate registration',
    )
  })

  test('ignores destroy when listeners were never initialized', () => {
    listener.onModuleDestroy()

    expect(offSpy).not.toHaveBeenCalled()
  })

  test('allows re-initialization after destroy', () => {
    listener.onModuleInit()
    const firstInitCount = onSpy.mock.calls.length

    listener.onModuleDestroy()
    const firstDestroyCount = offSpy.mock.calls.length

    listener.onModuleInit()
    const secondInitCount = onSpy.mock.calls.length

    expect(firstDestroyCount).toBe(firstInitCount)
    expect(secondInitCount).toBe(firstInitCount * 2)
  })
})

// Every user ever authenticated into the wallet gets its notifications, and the transaction code with the offer's
// pre-authorized code redeems the offer
describe('NotificationEventsListener issuance session notifications', () => {
  const USER_PIN = '493536'
  const PRE_AUTHORIZED_CODE = 'PRE-AUTH-SNTL'

  const issuanceSession = new OpenId4VcIssuanceSessionRecord({
    id: 'session-1',
    createdAt: new Date('2026-11-26T10:00:00Z'),
    expiresAt: new Date('2026-11-26T10:10:00Z'),
    state: OpenId4VcIssuanceSessionState.AccessTokenCreated,
    issuerId: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    preAuthorizedCode: PRE_AUTHORIZED_CODE,
    userPin: USER_PIN,
    credentialOfferId: 'offer-1',
    credentialOfferPayload: {
      credential_issuer: 'https://issuer.example',
      credential_configuration_ids: ['GitHubContributor'],
    },
    openId4VciVersion: 'v1.draft15',
  })
  const event = {
    type: OpenId4VcIssuerEvents.IssuanceSessionStateChanged,
    metadata: { contextCorrelationId: 'tenant-t1' },
    payload: { issuanceSession, previousState: OpenId4VcIssuanceSessionState.OfferCreated },
  } as unknown as OpenId4VcIssuanceSessionStateChangedEvent

  // @CreateRequestContext checks `orm instanceof MikroORM` and forks its EntityManager per call
  const makeOrm = (): MikroORM => {
    const em = Object.assign(Object.create(EntityManager.prototype) as EntityManager, { name: 'default' })
    Object.assign(em, { fork: () => em })
    return Object.assign(Object.create(MikroORM.prototype) as MikroORM, { em })
  }

  let trySendNotification: ReturnType<typeof vi.fn>
  let child: ReturnType<typeof vi.fn>

  const emit = async (stateChange = event) => {
    const on = vi.fn<(type: NotificationEventType, handler: (event: NotificationEvent) => Promise<void>) => void>()
    const agent = { events: { on, off: vi.fn() } } as unknown as Agent
    const wallet = { users: { getItems: () => [new User({ id: 'u1' }), new User({ id: 'u2' })] } } as unknown as Wallet
    const em = { findOne: vi.fn().mockResolvedValue(wallet) } as unknown as EntityManager
    trySendNotification = vi.fn()
    child = vi.fn(() => createMock<Logger>())

    const listener = new NotificationEventsListener(
      agent,
      { trySendNotification } as unknown as NotificationService,
      makeOrm(),
      em,
      createMock<Logger>({ child }),
    )
    listener.onModuleInit()
    const [, handler] = on.mock.calls.find(([type]) => type === OpenId4VcIssuerEvents.IssuanceSessionStateChanged)!
    await handler(stateChange)
  }

  test('sends the session view of the GET routes, without the transaction code', async () => {
    await emit()

    expect(trySendNotification).toHaveBeenCalledTimes(2)
    for (const [, notification] of trySendNotification.mock.calls) {
      const sent = JSON.parse(JSON.stringify(notification)) as Record<string, Record<string, unknown>>
      expect(sent.issuanceSession).not.toHaveProperty('userPin')
      expect(JSON.stringify(sent)).not.toContain(USER_PIN)
      expect(sent.type).toBe(OpenId4VcIssuerEvents.IssuanceSessionStateChanged)
      expect(sent.previousState).toBe(OpenId4VcIssuanceSessionState.OfferCreated)
      expect(sent.issuanceSession).toMatchObject({
        id: 'session-1',
        state: OpenId4VcIssuanceSessionState.AccessTokenCreated,
        publicIssuerId: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        expiresAt: '2026-11-26T10:10:00.000Z',
      })
    }
  })

  test('keeps the reason of a failed session', async () => {
    const failed = new OpenId4VcIssuanceSessionRecord({
      id: 'session-2',
      createdAt: new Date('2026-11-26T10:00:00Z'),
      expiresAt: new Date('2026-11-26T10:10:00Z'),
      state: OpenId4VcIssuanceSessionState.Error,
      issuerId: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      credentialOfferId: 'offer-2',
      credentialOfferPayload: issuanceSession.credentialOfferPayload,
      openId4VciVersion: 'v1.draft15',
      errorMessage: 'Credential offer has expired',
    })

    await emit({
      ...event,
      payload: { issuanceSession: failed, previousState: OpenId4VcIssuanceSessionState.AccessTokenCreated },
    })

    expect(trySendNotification).toHaveBeenCalledTimes(2)
    for (const [, notification] of trySendNotification.mock.calls) {
      expect(JSON.parse(JSON.stringify(notification))).toMatchObject({
        previousState: OpenId4VcIssuanceSessionState.AccessTokenCreated,
        issuanceSession: {
          id: 'session-2',
          state: OpenId4VcIssuanceSessionState.Error,
          errorMessage: 'Credential offer has expired',
        },
      })
    }
  })

  test('binds the event type and ids to the log context, not the record', async () => {
    await emit()

    expect(child).toHaveBeenCalledWith('sendEventNotification', {
      tenantId: 't1',
      notification: { type: OpenId4VcIssuerEvents.IssuanceSessionStateChanged, id: 'session-1' },
    })
    const bindings = JSON.stringify(child.mock.calls)
    expect(bindings).not.toContain(USER_PIN)
    expect(bindings).not.toContain(PRE_AUTHORIZED_CODE)
  })
})
