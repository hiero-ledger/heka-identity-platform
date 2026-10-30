import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import SharedProofData from '../../src/components/misc/SharedProofData'
import { preparePresentationData, useCredentials } from '../../src/credentials'

import { mockFunction } from '../../../jest-helpers/helpers'

jest.mock('@heka-wallet/shared', () => {
  const theme = { Spacing: {}, TextTheme: { normal: {} }, ColorPalette: { semantic: {} } }
  return { useHekaTheme: () => theme }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/credentials', () => ({ preparePresentationData: jest.fn(), useCredentials: jest.fn() }))

jest.mock('../../src/utils/agent', () => {
  const agent = { config: { logger: { error: jest.fn() } } }
  return { useHekaAgent: () => ({ agent }) }
})

jest.mock('../../src/components/cards', () => ({
  CredentialCard: () => null,
  SectionCard: jest.requireActual('react-native').View,
}))
jest.mock('../../src/components/views/LoadingView', () => {
  const { Text } = jest.requireActual('react-native')
  return { Loader: () => <Text>loader</Text> }
})
jest.mock('../../src/components/misc/Record', () => ({ Record: () => null }))

const record = { id: 'proof-id' } as DidCommProofExchangeRecord

describe('SharedProofData', () => {
  it('stops loading and shows the error when credentials cannot be loaded', async () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false, error: new Error('Failed') })

    render(<SharedProofData record={record} />)

    await waitFor(() => expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy())
    expect(screen.queryByText('loader')).toBeNull()
    expect(preparePresentationData).not.toBeCalled()
  })

  it('stops loading when the wallet has no credentials', async () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false })
    mockFunction(preparePresentationData).mockResolvedValue([])

    render(<SharedProofData record={record} />)

    await waitFor(() => expect(screen.queryByText('loader')).toBeNull())
    expect(screen.queryByText('Credentials.LoadFailed')).toBeNull()
  })

  it('waits while credentials are loading', () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: true })

    render(<SharedProofData record={record} />)

    expect(screen.getByText('loader')).toBeTruthy()
    expect(preparePresentationData).not.toBeCalled()
  })
})
