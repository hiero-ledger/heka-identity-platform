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
jest.mock('../../src/components/misc/Record', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Record: ({ fields }: { fields: { name: string; value: string }[] }) =>
      fields.map(({ name, value }) => <Text key={name}>{`${name}: ${value}`}</Text>),
  }
})

const record = { id: 'proof-id' } as DidCommProofExchangeRecord

describe('SharedProofData', () => {
  it('stops loading and shows the error when credentials cannot be loaded', async () => {
    mockFunction(useCredentials).mockReturnValue({
      credentials: [],
      isLoading: false,
      error: new Error('Failed'),
      isPartial: false,
    })

    render(<SharedProofData record={record} />)

    await waitFor(() => expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy())
    expect(screen.queryByText('loader')).toBeNull()
    expect(preparePresentationData).not.toBeCalled()
  })

  it('shows the shared data of the credentials that loaded when a provider failed', async () => {
    const credentials = [{ id: 'credential-id' }] as never
    mockFunction(useCredentials).mockReturnValue({
      credentials,
      isLoading: false,
      error: new Error('Storage unavailable'),
      isPartial: true,
    })
    mockFunction(preparePresentationData).mockResolvedValue([{ shared: [{ name: 'degree', value: 'Bachelor' }] }])

    render(<SharedProofData record={record} />)

    expect(await screen.findByText('degree: Bachelor')).toBeTruthy()
    expect(screen.getByText('Credentials.LoadFailed')).toBeTruthy()
    expect(screen.queryByText('loader')).toBeNull()
    expect(preparePresentationData).toBeCalledWith(record, expect.anything(), credentials)
  })

  it('stops loading when the wallet has no credentials', async () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: false, isPartial: false })
    mockFunction(preparePresentationData).mockResolvedValue([])

    render(<SharedProofData record={record} />)

    await waitFor(() => expect(screen.queryByText('loader')).toBeNull())
    expect(screen.queryByText('Credentials.LoadFailed')).toBeNull()
  })

  it('waits while credentials are loading', () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: [], isLoading: true, isPartial: false })

    render(<SharedProofData record={record} />)

    expect(screen.getByText('loader')).toBeTruthy()
    expect(preparePresentationData).not.toBeCalled()
  })
})
