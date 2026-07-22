import { createMock } from '@golevelup/ts-vitest'
import { EntityManager, MikroORM } from '@mikro-orm/core'

import { Agent } from 'common/agent'
import { Logger } from 'common/logger'

import { NotificationEventsListener } from '../notification-events.listener'
import { NotificationService } from '../notification.service'

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
    logger = createMock<Logger>({ warn: warnSpy } as Partial<Logger>)

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
