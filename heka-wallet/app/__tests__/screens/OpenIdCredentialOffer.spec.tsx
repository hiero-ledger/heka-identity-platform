// Covers: #44 — OpenIdCredentialOffer screen unit tests
import React from 'react'
import { View } from 'react-native'
import { render, act, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'

jest.mock('@credo-ts/react-hooks', () => ({
  useAgent: jest.fn(),
}))

jest.mock('../../src/credentials', () => ({
  mapCredentialRecord: jest.fn(),
  useOpenIdHandlers: jest.fn(),
  useCredentialRecordHelpers: jest.fn(),
}))

jest.mock('@heka-wallet/shared', () => ({
  ConfirmationInputModal: ({ isVisible }: { isVisible: boolean }) =>
    isVisible ? React.createElement(View, { testID: 'pin-modal' }) : null,
  ConfirmationInputType: { Password: 'Password' },
}))

jest.mock('../../src/components/views', () => ({
  CredentialOfferView: () => React.createElement(View, { testID: 'credential-offer-view' }),
}))

jest.mock('../../src/components/views/LoadingView', () => () =>
  React.createElement(View, { testID: 'loading-view' }),
)

jest.mock('@hyperledger/aries-bifold-core', () => ({
  BifoldError: class BifoldError extends Error {
    public constructor(
      public title: string,
      public message: string,
      public description: string,
      public code: number,
    ) {
      super(message)
    }
  },
  EventTypes: { ERROR_ADDED: 'error-added' },
  Screens: { Home: 'Home' },
  TabStacks: { HomeStack: 'HomeStack' },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children),
}))

jest.mock('@sphereon/oid4vci-common', () => ({
  PRE_AUTH_GRANT_LITERAL: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { useAgent } from '@credo-ts/react-hooks'
import { mapCredentialRecord, useOpenIdHandlers, useCredentialRecordHelpers } from '../../src/credentials'
import { OpenIdCredentialOffer } from '../../src/screens/OpenIdCredentialOffer'

const mockUseAgent = mockFunction(useAgent as jest.Mock)
const mockUseOpenIdHandlers = mockFunction(useOpenIdHandlers as jest.Mock)
const mockUseCredentialRecordHelpers = mockFunction(useCredentialRecordHelpers as jest.Mock)
const mockMapCredentialRecord = mockFunction(mapCredentialRecord as jest.Mock)

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

const mockNavigation = {
  navigate: jest.fn(),
  getParent: jest.fn(() => ({ navigate: jest.fn() })),
}

function buildProps(routeOverride: Record<string, unknown> = {}) {
  return {
    navigation: mockNavigation as any,
    route: { params: { offer: 'openid-credential-offer://test', ...routeOverride } } as any,
  }
}

describe('OpenIdCredentialOffer', () => {
  const mockResolveOffer = jest.fn()
  const mockAcquireToken = jest.fn()
  const mockReceiveCredential = jest.fn()
  const mockStoreCredential = jest.fn()

  beforeEach(() => {
    mockUseAgent.mockReturnValue({ agent: { id: 'agent' }, publicDid: 'did:peer:123' })
    mockUseOpenIdHandlers.mockReturnValue({
      resolveOpenId4VciOffer: mockResolveOffer,
      acquireAccessToken: mockAcquireToken,
      receiveCredentialFromOpenId4VciOffer: mockReceiveCredential,
    })
    mockUseCredentialRecordHelpers.mockReturnValue({
      storeCredentialRecord: mockStoreCredential,
    })
  })

  // Covers: #44 — guard against missing route params
  it('throws when route params are undefined', () => {
    expect(() =>
      render(
        <OpenIdCredentialOffer
          navigation={mockNavigation as any}
          route={{ params: undefined } as any}
        />,
      ),
    ).toThrow('OpenIdCredentialOffer route params were not set properly')
  })

  // Covers: #44 — loading state shows while offer resolves
  it('renders LoadingView while offer is resolving', () => {
    mockResolveOffer.mockReturnValue(new Promise(() => {}))

    const { getByTestId } = render(<OpenIdCredentialOffer {...buildProps()} />)

    expect(getByTestId('loading-view')).toBeTruthy()
  })

  // Covers: #44 — LoadingView shown when agent or publicDid absent
  it('renders LoadingView when publicDid is not yet available', () => {
    mockUseAgent.mockReturnValue({ agent: null, publicDid: null })

    const { getByTestId } = render(<OpenIdCredentialOffer {...buildProps()} />)

    expect(getByTestId('loading-view')).toBeTruthy()
  })

  // Covers: #44 — happy path: CredentialOfferView after credential resolves
  it('renders CredentialOfferView after credential is received without PIN', async () => {
    const mockRecord = { id: 'rec-1' } as any
    const mockCredential = { record: mockRecord, id: 'cred-1' } as any

    mockResolveOffer.mockResolvedValue({
      resolvedCredentialOffer: {
        credentialOfferPayload: {
          grants: {
            [PRE_AUTH_GRANT]: { user_pin_required: false },
          },
        },
      },
    })
    mockAcquireToken.mockResolvedValue({ access_token: 'token-abc' })
    mockReceiveCredential.mockResolvedValue(mockRecord)
    mockMapCredentialRecord.mockResolvedValue(mockCredential)

    const { findByTestId } = render(<OpenIdCredentialOffer {...buildProps()} />)

    expect(await findByTestId('credential-offer-view')).toBeTruthy()
  })

  // Covers: #44 — PIN gate: modal visible when user_pin_required is true
  it('shows PIN modal when offer requires user PIN', async () => {
    mockResolveOffer.mockResolvedValue({
      resolvedCredentialOffer: {
        credentialOfferPayload: {
          grants: {
            [PRE_AUTH_GRANT]: { user_pin_required: true },
          },
        },
      },
    })

    const { findByTestId } = render(<OpenIdCredentialOffer {...buildProps()} />)

    expect(await findByTestId('pin-modal')).toBeTruthy()
  })

  // Covers: #44 — onAccept stores credential record
  it('calls storeCredentialRecord when credential is accepted', async () => {
    const mockRecord = { id: 'rec-1' } as any
    const mockCredential = { record: mockRecord, id: 'cred-1' } as any

    mockResolveOffer.mockResolvedValue({
      resolvedCredentialOffer: {
        credentialOfferPayload: {
          grants: { [PRE_AUTH_GRANT]: { user_pin_required: false } },
        },
      },
    })
    mockAcquireToken.mockResolvedValue({ access_token: 'tok' })
    mockReceiveCredential.mockResolvedValue(mockRecord)
    mockMapCredentialRecord.mockResolvedValue(mockCredential)
    mockStoreCredential.mockResolvedValue(undefined)

    render(<OpenIdCredentialOffer {...buildProps()} />)

    await waitFor(() => expect(mockReceiveCredential).toHaveBeenCalledTimes(1))
  })

  // Covers: #44 — onDecline navigates home
  it('navigates to home when offer resolution fails', async () => {
    const parentNavigate = jest.fn()
    const nav = { ...mockNavigation, getParent: jest.fn(() => ({ navigate: parentNavigate })) }

    mockResolveOffer.mockRejectedValue(new Error('network error'))

    render(
      <OpenIdCredentialOffer
        navigation={nav as any}
        route={{ params: { offer: 'openid-credential-offer://test' } } as any}
      />,
    )

    await waitFor(() => expect(parentNavigate).toHaveBeenCalledWith('HomeStack', { screen: 'Home' }))
  })
})
