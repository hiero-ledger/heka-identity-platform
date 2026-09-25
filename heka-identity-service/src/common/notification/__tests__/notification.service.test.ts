import { createMock } from '@golevelup/ts-vitest'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'

import { MessageDeliveryType, User } from 'common/entities'
import { Logger } from 'common/logger'
import { WebhookEgressService, WebhookTargetPolicyError } from 'common/webhook'

import { NotificationDto } from '../dto'
import { NotificationGateway } from '../notification.gateway'
import { NotificationService } from '../notification.service'

describe('NotificationService', () => {
  let httpService: HttpService
  let post: ReturnType<typeof vi.fn>
  let webhookEgress: WebhookEgressService
  let notificationGateway: NotificationGateway
  let notificationService: NotificationService
  let childLogger: Logger
  let child: ReturnType<typeof vi.fn>

  const notification = { type: 'ConnectionStateChanged' } as unknown as NotificationDto

  beforeEach(() => {
    post = vi.fn().mockResolvedValue({ status: 200 })
    httpService = createMock<HttpService>({ axiosRef: { post } } as unknown as Partial<HttpService>)
    webhookEgress = createMock<WebhookEgressService>()
    vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockResolvedValue(undefined)
    notificationGateway = createMock<NotificationGateway>()
    childLogger = createMock<Logger>()
    child = vi.fn().mockReturnValue(childLogger)

    notificationService = new NotificationService(
      httpService,
      webhookEgress,
      notificationGateway,
      { allowHttp: false, allowPrivateAddresses: false, timeoutMs: 10_000 },
      createMock<Logger>({ child }),
    )
  })

  test('posts to the webhook after the URL passes the egress policy', async () => {
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook: 'https://hooks.dev' })

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(true)

    expect(webhookEgress.assertCallbackUrlAllowed).toHaveBeenCalledWith('https://hooks.dev')
    expect(post).toHaveBeenCalledWith(
      'https://hooks.dev',
      notification,
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  // A stored URL can become disallowed after it was saved (policy change or new DNS answer),
  // so the check runs again on every send and must happen before the request is issued.
  test('does not post when the stored webhook is rejected by the policy', async () => {
    const user = new User({
      id: '11',
      messageDeliveryType: MessageDeliveryType.WebHook,
      webHook: 'http://169.254.169.254/latest/meta-data',
    })
    vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockRejectedValue(
      new WebhookTargetPolicyError('ADDR', 'Webhook target address is not permitted'),
    )

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    expect(post).not.toHaveBeenCalled()
  })

  // The user entity carries the webhook URL, which may embed credentials or tokens; only
  // identifiers may reach the log context of the failure record.
  test('logs a rejected delivery without the webhook URL', async () => {
    const webHook = 'https://alice:s3cret@hooks.example.com/notify?token=abc'
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook })
    vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockRejectedValue(
      new WebhookTargetPolicyError('CREDENTIALS', 'Webhook URL must not include credentials'),
    )

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    const bindingCall = child.mock.calls.find(([context]) => context === 'trySendNotification')
    expect(bindingCall).toBeDefined()
    const bindings = bindingCall![1] as Record<string, unknown>
    expect(bindings).toEqual({
      user: { id: '11', messageDeliveryType: MessageDeliveryType.WebHook },
      notification,
    })
    const serialized = JSON.stringify(bindings)
    expect(serialized).not.toContain(webHook)
    expect(serialized).not.toContain('s3cret')
    expect(serialized).not.toContain('hooks.example.com')

    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'policy:CREDENTIALS' }),
      'Notification delivery failed',
    )
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          name: 'WebhookTargetPolicyError',
          message: 'Webhook URL must not include credentials',
          code: undefined,
        },
      }),
      'Notification delivery failed',
    )
    expect(post).not.toHaveBeenCalled()
  })

  test('reports a failed delivery without throwing', async () => {
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook: 'https://hooks.dev' })
    post.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }))

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)
  })

  // The credential policy only rejects userinfo; secrets in the path or query are accepted and
  // must not reach the failure record through the Axios error's serialized request config.
  test('logs a failed HTTP delivery without the webhook URL', async () => {
    const webHook = 'https://hooks.example.com/services/T0/B0/s3cretPathToken?token=abc'
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook })
    post.mockRejectedValue(
      new AxiosError(
        'Request failed with status code 500',
        'ERR_BAD_RESPONSE',
        { url: webHook, data: '{}' } as never,
        undefined,
        { status: 500 } as never,
      ),
    )

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    expect(childLogger.error).toHaveBeenCalledWith(
      {
        error: {
          name: 'AxiosError',
          message: 'Request failed with status code 500',
          code: 'ERR_BAD_RESPONSE',
          status: 500,
        },
        reason: 'ERR_BAD_RESPONSE',
      },
      'Notification delivery failed',
    )
    const serialized = JSON.stringify(vi.mocked(childLogger.error).mock.calls)
    expect(serialized).not.toContain('s3cretPathToken')
    expect(serialized).not.toContain('token=abc')
    expect(serialized).not.toContain('/services/T0/B0')
  })

  test('logs a failed HTTP delivery without a response with an undefined status', async () => {
    const webHook = 'https://hooks.example.com/notify?token=abc'
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook })
    post.mockRejectedValue(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED', { url: webHook } as never))

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    expect(childLogger.error).toHaveBeenCalledWith(
      {
        error: { name: 'AxiosError', message: 'connect ECONNREFUSED', code: 'ECONNREFUSED', status: undefined },
        reason: 'ECONNREFUSED',
      },
      'Notification delivery failed',
    )
    expect(JSON.stringify(vi.mocked(childLogger.error).mock.calls)).not.toContain('token=abc')
  })

  // axios parses the URL outside its error wrapping, so an unparseable URL rejects with Node's raw
  // ERR_INVALID_URL TypeError, which keeps the full URL in its enumerable `input` property.
  test('logs a failed delivery with an unparseable URL without the URL', async () => {
    const webHook = '\u00a0https://hooks.example.com/services/T0/B0/s3cretPathToken?token=abc'
    const invalidUrl = (() => {
      try {
        new URL(webHook)
      } catch (error) {
        return error
      }
    })()
    expect(invalidUrl).toBeDefined()
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook })
    post.mockRejectedValue(invalidUrl)

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    expect(childLogger.error).toHaveBeenCalledWith(
      {
        error: { name: 'TypeError', message: 'Invalid URL', code: 'ERR_INVALID_URL' },
        reason: 'ERR_INVALID_URL',
      },
      'Notification delivery failed',
    )
    const serialized = JSON.stringify(vi.mocked(childLogger.error).mock.calls)
    expect(serialized).not.toContain('s3cretPathToken')
    expect(serialized).not.toContain('token=abc')
    expect(serialized).not.toContain('/services/T0/B0')
  })

  test('logs a non-Error delivery failure by type only', async () => {
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebHook, webHook: 'https://hooks.dev' })
    post.mockRejectedValue('https://hooks.example.com/x?token=abc')

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(false)

    expect(childLogger.error).toHaveBeenCalledWith(
      { error: { type: 'string' }, reason: 'error' },
      'Notification delivery failed',
    )
    expect(JSON.stringify(vi.mocked(childLogger.error).mock.calls)).not.toContain('token=abc')
  })

  test('uses the WebSocket gateway and skips the egress policy for non-webhook users', async () => {
    const user = new User({ id: '11', messageDeliveryType: MessageDeliveryType.WebSocket })

    await expect(notificationService.trySendNotification(user, notification)).resolves.toBe(true)

    expect(notificationGateway.send).toHaveBeenCalledWith('11', notification)
    expect(webhookEgress.assertCallbackUrlAllowed).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
