import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Pressable, Text } from 'react-native'

import { OpenIdCredentialOffer } from '../../src/screens/OpenIdCredentialOffer'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const CREDENTIAL_PIN = '1234'

const mockAgent = {}
const mockResolveOpenId4VciOffer = jest.fn()
const mockAcquireAccessToken = jest.fn()
const mockReceiveCredential = jest.fn()
const mockMapCredentialRecord = jest.fn()

type PinModalProps = { isVisible: boolean; onConfirm: (pin: string) => void }

// Read lazily by the hoisted factories below.
const mockPinModal = ({ isVisible, onConfirm }: PinModalProps) =>
  isVisible ? (
    <Pressable testID="pin-confirm" onPress={() => onConfirm(CREDENTIAL_PIN)}>
      <Text>pin-modal</Text>
    </Pressable>
  ) : null
const mockText = (text: string) => <Text>{text}</Text>

jest.mock('@bifold/core', () => ({
  __esModule: true,
  BifoldError: class extends Error {},
  EventTypes: { ERROR_ADDED: 'ErrorAdded' },
  Screens: { Home: 'Home' },
  TabStacks: { HomeStack: 'HomeStack' },
}))

jest.mock('@heka-wallet/shared', () => ({
  ConfirmationInputType: { Password: 'password' },
  ConfirmationInputModal: (props: PinModalProps) => mockPinModal(props),
}))

// A stable t, as react-i18next gives: the screen's resolve effect depends on it.
const mockT = (key: string) => key
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/views', () => ({ CredentialOfferView: () => mockText('credential-offer-view') }))
jest.mock('../../src/components/views/LoadingView', () => ({ __esModule: true, default: () => mockText('loading') }))
jest.mock('../../src/navigators/types', () => ({}))

jest.mock('../../src/credentials', () => ({
  PRE_AUTH_GRANT_LITERAL: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
  mapCredentialRecord: (...args: unknown[]) => mockMapCredentialRecord(...args),
  useOpenIdHandlers: () => ({
    resolveOpenId4VciOffer: mockResolveOpenId4VciOffer,
    acquireAccessToken: mockAcquireAccessToken,
    receiveCredentialFromOpenId4VciOffer: mockReceiveCredential,
  }),
  useCredentialRecordHelpers: () => ({ storeCredentialRecord: jest.fn() }),
}))

// utils/agent.ts eagerly imports native/ESM Credo modules; only the hook is needed here.
// No public DID: the wallet started without a mediator.
jest.mock('../../src/utils/agent', () => ({
  useHekaAgent: () => ({ loading: false, agent: mockAgent, publicDid: undefined }),
}))

function renderScreen() {
  const props = {
    navigation: { getParent: () => ({ navigate: jest.fn() }) },
    route: { params: { offer: { uri: 'openid-credential-offer://?credential_offer_uri=mock' } } },
  } as unknown as React.ComponentProps<typeof OpenIdCredentialOffer>
  return render(<OpenIdCredentialOffer {...props} />)
}

describe('OpenIdCredentialOffer', () => {
  it('should ask for the credential PIN before requesting a PIN-protected credential', async () => {
    const resolvedCredentialOffer = {
      credentialOfferPayload: { grants: { [PRE_AUTH_GRANT]: { user_pin_required: true } } },
    }
    mockResolveOpenId4VciOffer.mockResolvedValueOnce({ resolvedCredentialOffer })
    mockAcquireAccessToken.mockResolvedValueOnce({ accessToken: 'mock-token' })
    mockReceiveCredential.mockResolvedValueOnce({ id: 'mock-record' })
    mockMapCredentialRecord.mockResolvedValueOnce({ record: { id: 'mock-record' } })

    renderScreen()

    fireEvent.press(await screen.findByTestId('pin-confirm'))

    expect(await screen.findByText('credential-offer-view')).toBeTruthy()
    expect(mockAcquireAccessToken).toHaveBeenCalledWith({ resolvedCredentialOffer, userPin: CREDENTIAL_PIN })
    expect(mockReceiveCredential).toHaveBeenCalledTimes(1)
  })
})
