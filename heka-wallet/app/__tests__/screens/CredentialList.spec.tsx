import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { useCredentials } from '../../src/credentials'
import { CredentialList } from '../../src/screens/CredentialList'

import { mockFunction } from '../../../jest-helpers/helpers'

jest.mock('@bifold/core', () => {
  const { Text } = jest.requireActual('react-native')
  const services = [() => null, ({ message }: { message: string }) => <Text>{message}</Text>]
  return {
    Screens: { CredentialDetails: 'CredentialDetails' },
    TOKENS: {},
    useServices: () => services,
  }
})

jest.mock('@bifold/core/src/utils/credential', () => ({ toImageSource: jest.fn() }))

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    IconSizes: {},
    BorderRadius: {},
    TextTheme: { title: {}, modalNormal: {}, normal: {} },
    Spacing: { md: 16, lg: 20 },
    TabTheme: { tabBarStyle: { position: 'absolute', height: 65, marginBottom: 16 } },
    BorderWidth: {},
    ColorPalette: { brand: {}, grayscale: {}, semantic: {} },
    HekaTextTheme: { bodySmall: {} },
    FontWeights: {},
  }
  return { useHekaTheme: () => theme }
})

// The real package index needs the full @react-navigation/core, which is mocked below; the context is all the screen uses
jest.mock('@react-navigation/bottom-tabs', () => ({
  BottomTabBarHeightContext: jest.requireActual('react').createContext(undefined),
}))

jest.mock('@react-navigation/core', () => {
  const navigation = { navigate: jest.fn() }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/credentials', () => ({ useCredentials: jest.fn() }))

jest.mock('../../src/components/views/LoadingView', () => {
  const { Text } = jest.requireActual('react-native')
  return { __esModule: true, default: () => <Text>loading</Text> }
})

const credential = {
  id: 'credential-id',
  display: { name: 'Diploma', issuer: { name: 'University' } },
}

describe('CredentialList', () => {
  it('shows the empty wallet message when nothing failed', () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false, isPartial: false })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.EmptyList')).toBeTruthy()
    expect(screen.queryByText('Credentials.LoadFailed')).toBeNull()
  })

  it('shows the load error instead of the empty wallet message', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [],
      isLoading: false,
      error: new Error('Failed'),
      isPartial: false,
    })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy()
    expect(screen.queryByText('Credentials.EmptyList')).toBeNull()
  })

  it('shows the load error above the credentials that did load', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential] as never,
      isLoading: false,
      error: new Error('Failed'),
      isPartial: true,
    })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy()
    expect(screen.getByText('Diploma')).toBeTruthy()
  })

  it('marks revoked credentials in the list', () => {
    const revokedCredential = {
      id: 'revoked-credential-id',
      display: { name: 'Revoked diploma', issuer: { name: 'University' }, isRevoked: true },
    }
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential, revokedCredential] as never,
      isLoading: false,
      isPartial: false,
    })

    render(<CredentialList />)

    expect(screen.getAllByTestId('CredentialRevokedBadge')).toHaveLength(1)
    expect(screen.getByText('CredentialDetails.Revoked')).toBeTruthy()
  })

  it('does not mark credentials that are not revoked', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential] as never,
      isLoading: false,
      isPartial: false,
    })

    render(<CredentialList />)

    expect(screen.getByText('Diploma')).toBeTruthy()
    expect(screen.queryByTestId('CredentialRevokedBadge')).toBeNull()
  })

  it('lets the last credential scroll fully above the floating tab bar', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential] as never,
      isLoading: false,
      isPartial: false,
    })

    render(
      <BottomTabBarHeightContext.Provider value={65}>
        <CredentialList />
      </BottomTabBarHeightContext.Provider>
    )

    // Measured tab bar height + its bottom margin + spacing
    expect(screen.getByTestId('CredentialList').props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 65 + 16 + 16 })
    )
  })

  it('adds no bottom space outside the tab navigator', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential] as never,
      isLoading: false,
      isPartial: false,
    })

    render(<CredentialList />)

    expect(screen.getByTestId('CredentialList').props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 0 })
    )
  })
})
