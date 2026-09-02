import type { Meta, StoryObj } from '@storybook/react'
import { createKcPageStory } from '../KcPageStory'

const { KcPageStory } = createKcPageStory({ pageId: 'login.ftl' })

const meta = {
  title: 'login/login.ftl',
  component: KcPageStory,
} satisfies Meta<typeof KcPageStory>

export default meta

type Story = StoryObj<typeof meta>

/** The demo realm as configured in heka-sso-service/keycloak/realm-heka.json. */
export const HekaDemoRealm: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        realm: {
          displayName: 'OID4VP SSO Demo',
          displayNameHtml: 'OID4VP SSO Demo',
          registrationAllowed: false,
          resetPasswordAllowed: false,
          rememberMe: false,
        },
        social: {
          providers: [
            {
              alias: 'heka-sso',
              displayName: 'Sign in with wallet',
              loginUrl: '#',
              providerId: 'oidc',
            },
          ],
        },
      }}
    />
  ),
}

export const WithError: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        realm: {
          displayName: 'OID4VP SSO Demo',
          displayNameHtml: 'OID4VP SSO Demo',
        },
        message: {
          type: 'error',
          summary: 'Unexpected error when authenticating with identity provider',
        },
        social: {
          providers: [
            {
              alias: 'heka-sso',
              displayName: 'Sign in with wallet',
              loginUrl: '#',
              providerId: 'oidc',
            },
          ],
        },
      }}
    />
  ),
}
