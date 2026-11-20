import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { NotificationCard, NotificationType } from '../../src/components/cards/NotificationCard'

const mockParentNavigate = jest.fn()

jest.mock('@bifold/core', () => ({
  BifoldError: class extends Error {},
  EventTypes: { ERROR_ADDED: 'ErrorAdded' },
  Screens: {
    CredentialDetails: 'CredentialDetails',
    CredentialOffer: 'CredentialOffer',
    ProofRequest: 'ProofRequest',
    ProofDetails: 'ProofDetails',
    CustomNotification: 'CustomNotification',
  },
  Stacks: { NotificationStack: 'NotificationStack', ContactStack: 'ContactStack' },
  useStore: () => [{}, jest.fn()],
}))

jest.mock('@bifold/react-hooks', () => ({ useOptionalAgent: () => ({ agent: undefined }) }))
jest.mock('@bifold/verifier', () => ({ markProofAsViewed: jest.fn() }))
jest.mock('@credo-ts/didcomm', () => ({
  DidCommProofState: { Done: 'done', PresentationReceived: 'presentation-received' },
}))

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    BorderRadius: {},
    BorderWidth: {},
    ColorPalette: { brand: {}, grayscale: {} },
    IconSizes: {},
    Spacing: {},
    TextTheme: { title: {}, normal: {} },
  }
  return { useHekaTheme: () => theme }
})

jest.mock('@react-navigation/native', () => {
  const navigation = { getParent: () => ({ navigate: mockParentNavigate }) }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-vector-icons/MaterialIcons', () => () => null)

jest.mock('../../src/components/misc/ExchangeRecordDisplay', () => ({ ExchangeRecordDisplay: () => null }))
jest.mock('../../src/components/modals/ActionWarningModal', () => ({
  __esModule: true,
  default: () => null,
  ModalUsage: {},
}))

const revokedCredentialRecord = {
  id: 'credential-exchange-id',
  type: 'CredentialRecord',
  revocationNotification: { revocationDate: new Date() },
} as never

describe('NotificationCard', () => {
  it('opens the details of the revoked credential by its exchange record id', () => {
    render(
      <NotificationCard notificationType={NotificationType.Revocation} notificationRecord={revokedCredentialRecord} />
    )

    fireEvent.press(screen.getByText('Notifications.CredentialRevoked'))

    expect(mockParentNavigate).toBeCalledWith('NotificationStack', {
      screen: 'CredentialDetails',
      params: { credentialId: 'credential-exchange-id' },
    })
  })

  it('cannot be dismissed without opening the revoked credential', () => {
    render(
      <NotificationCard notificationType={NotificationType.Revocation} notificationRecord={revokedCredentialRecord} />
    )

    expect(screen.queryByLabelText('Global.Dismiss')).toBeNull()
  })
})
