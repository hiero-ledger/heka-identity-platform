import type { TOKENS, TokenMapping } from '@bifold/core'

type GenerateOnboardingWorkflowSteps = TokenMapping[typeof TOKENS.ONBOARDING]

/**
 * Heka offers push notifications in Settings only, not as an onboarding step.
 * Bifold treats the push step as unfinished while `enablePushNotifications` is configured and
 * `didConsiderPushNotifications` is false, and Heka's onboarding has no screen for it — so the
 * generator gets a config without `enablePushNotifications`, which marks the step complete.
 */
export function withoutPushNotificationsStep(
  generate: GenerateOnboardingWorkflowSteps
): GenerateOnboardingWorkflowSteps {
  return (state, config, termsVersion, agent) =>
    generate(state, { ...config, enablePushNotifications: undefined }, termsVersion, agent)
}
