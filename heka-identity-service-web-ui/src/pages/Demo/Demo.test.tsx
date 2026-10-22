import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import Demo from './Demo';

jest.mock('@/components/Steps', () => {
  const stubs = jest.requireActual('./demoTestStubs');
  return {
    ...jest.requireActual('@/components/Steps'),
    SelectSchema: stubs.SelectSchemaStub,
    FillCredentialData: stubs.FillCredentialDataStub,
  };
});
jest.mock('@/components/Steps/CredentialOffer/CredentialOffer', () => ({
  CredentialOffer: jest.requireActual('./demoTestStubs').CredentialOfferStub,
}));
jest.mock('@/components/Steps/VerificationRequest/VerificationRequest', () => ({
  VerificationRequest:
    jest.requireActual('./demoTestStubs').VerificationRequestStub,
}));

describe('Demo', () => {
  test('issues a demo credential, verifies it and starts again', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Demo />, { route: '/demo' });

    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText('schema: undefined; demo: true'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use Passport' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Issue new credential')).toBeInTheDocument();
    expect(screen.getByText('fill: Passport')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Issue' }));

    expect(screen.getByText('Credential offer')).toBeInTheDocument();
    expect(
      screen.getByText('offer: OpenId4VC/vc+sd-jwt; demo: true'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('offered: {"firstName":"Alice"}'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verify Credential' }));

    expect(
      screen.getByText('Credential verification request'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'request: OpenId4VC/vc+sd-jwt; schema: Passport; demo: true',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start again' }));

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText('schema: undefined; demo: true'),
    ).toBeInTheDocument();
  });

  test('goes back to the schema and can skip issuance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Demo />, { route: '/demo' });

    await user.click(screen.getByRole('button', { name: 'Use Passport' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select schema')).toBeInTheDocument();
    expect(
      screen.getByText('schema: Passport; demo: true'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(
      screen.getByText('Credential verification request'),
    ).toBeInTheDocument();
  });
});
