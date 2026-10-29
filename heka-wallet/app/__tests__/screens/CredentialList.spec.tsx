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
    Spacing: {},
    BorderWidth: {},
    ColorPalette: { brand: {}, grayscale: {}, semantic: {} },
    HekaTextTheme: { bodySmall: {} },
    FontWeights: {},
  }
  return { useHekaTheme: () => theme }
})

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
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.EmptyList')).toBeTruthy()
    expect(screen.queryByText('Credentials.LoadFailed')).toBeNull()
  })

  it('shows the load error instead of the empty wallet message', () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false, error: new Error('Failed') })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy()
    expect(screen.queryByText('Credentials.EmptyList')).toBeNull()
  })

  it('shows the load error above the credentials that did load', () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [credential] as never,
      isLoading: false,
      error: new Error('Failed'),
    })

    render(<CredentialList />)

    expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy()
    expect(screen.getByText('Diploma')).toBeTruthy()
  })
})
