import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { CredentialCard } from '../../src/components/cards/CredentialCard'
import { CredentialDisplay } from '../../src/credentials'

jest.mock('@bifold/core/src/utils/credential', () => ({
  credentialTextColor: () => '#000000',
  toImageSource: jest.fn(),
}))

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    BorderRadius: {},
    BorderWidth: {},
    ColorPalette: { brand: {}, grayscale: {}, semantic: {} },
    HekaTextTheme: { labelMedium: {}, labelLarge: {} },
    IconSizes: {},
    Spacing: {},
    TextTheme: { headingFour: {}, title: {} },
  }
  return { useHekaTheme: () => theme }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-vector-icons/MaterialIcons', () => () => null)

const display = (isRevoked?: boolean): CredentialDisplay => ({
  name: 'University diploma for the bachelor degree',
  attributes: [],
  issuer: { name: 'University' },
  isRevoked,
})

describe('CredentialCard', () => {
  it('marks a revoked credential', () => {
    render(<CredentialCard credentialDisplay={display(true)} />)

    expect(screen.getByTestId('CredentialRevokedBadge')).toBeTruthy()
    expect(screen.getByText('CredentialDetails.Revoked')).toBeTruthy()
    // The name gives up its second line to the badge so fixed-height cards keep their size
    expect(screen.getByText('University diploma for the bachelor degree')).toHaveProp('numberOfLines', 1)
  })

  it('keeps the card unchanged for a credential that is not revoked', () => {
    render(<CredentialCard credentialDisplay={display(false)} />)

    expect(screen.queryByTestId('CredentialRevokedBadge')).toBeNull()
    expect(screen.getByText('University diploma for the bachelor degree')).toHaveProp('numberOfLines', 2)
  })

  it('does not mark a credential without revocation info (OpenID credentials)', () => {
    render(<CredentialCard credentialDisplay={display(undefined)} />)

    expect(screen.queryByTestId('CredentialRevokedBadge')).toBeNull()
  })
})
