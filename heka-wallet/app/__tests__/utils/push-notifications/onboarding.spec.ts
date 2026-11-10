import type { OnboardingTask, TOKENS, TokenMapping } from '@bifold/core'

import { withoutPushNotificationsStep } from '../../../src/utils/push-notifications/onboarding'

type Generate = TokenMapping[typeof TOKENS.ONBOARDING]
type GenerateArgs = Parameters<Generate>

// Same rule as Bifold's isPushNotificationComplete: the step is complete when push is not configured
// or the user already considered it.
const bifoldGenerate: Generate = (state, config) => [
  {
    // @bifold/core is mocked in Jest, so the Screens enum value is not available at runtime
    name: 'PushNotifications' as unknown as OnboardingTask['name'],
    completed:
      !config.enablePushNotifications ||
      (state.onboarding.didConsiderPushNotifications && !!config.enablePushNotifications),
  },
]

describe('withoutPushNotificationsStep', () => {
  it('marks the push onboarding step complete although push is configured and not yet considered', () => {
    const state = { onboarding: { didConsiderPushNotifications: false } } as GenerateArgs[0]
    const config = {
      enablePushNotifications: { status: jest.fn(), setup: jest.fn(), toggle: jest.fn() },
    } as unknown as GenerateArgs[1]

    expect(bifoldGenerate(state, config, 1, null)[0].completed).toBe(false)
    expect(withoutPushNotificationsStep(bifoldGenerate)(state, config, 1, null)[0].completed).toBe(true)
  })

  it('passes everything else through to Bifold unchanged', () => {
    const generate = jest.fn(() => []) as unknown as jest.MockedFunction<Generate>
    const state = { onboarding: {} } as GenerateArgs[0]
    const config = { showPreface: false, enablePushNotifications: {} } as unknown as GenerateArgs[1]
    const agent = {} as GenerateArgs[3]

    withoutPushNotificationsStep(generate)(state, config, 7, agent)

    expect(generate).toHaveBeenCalledWith(state, { showPreface: false, enablePushNotifications: undefined }, 7, agent)
  })
})
