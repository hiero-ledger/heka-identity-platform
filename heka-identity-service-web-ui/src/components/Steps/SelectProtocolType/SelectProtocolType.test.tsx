import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ProtocolType } from '@/entities/Schema';
import { routeAgencyGets } from '@/pages/IssueCredential/testUtils';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { SelectProtocolType } from './SelectProtocolType';

let mockIsMobile = false;
jest.mock('@/components/Screen/Screen', () => ({
  ...jest.requireActual('@/components/Screen/Screen'),
  useMobile: () => mockIsMobile,
}));

const Harness = ({ onNext = jest.fn() }: { onNext?: () => void }) => {
  const [protocolType, setProtocolType] = useState<string>();
  const [credentialType, setCredentialType] = useState<string>();
  return (
    <>
      <SelectProtocolType
        title="Select protocol type"
        protocolType={protocolType as ProtocolType}
        credentialType={credentialType}
        onChangeProtocolType={setProtocolType}
        onChangeCredentialType={setCredentialType}
        onNext={onNext}
      />
      <output data-testid="selection">{`${protocolType}|${credentialType}`}</output>
    </>
  );
};

const renderStep = (onNext?: () => void) => {
  const api = createMockApi();
  routeAgencyGets(api);
  renderWithProviders(<Harness onNext={onNext} />, { api });
  return userEvent.setup();
};

describe('SelectProtocolType', () => {
  afterEach(() => {
    mockIsMobile = false;
  });

  test('defaults to Aries with anoncreds-indy', async () => {
    const onNext = jest.fn();
    const user = renderStep(onNext);

    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'Aries|anoncreds-indy',
      ),
    );
    expect(screen.getByText('Select credential type')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onNext).toHaveBeenCalled();
  });

  test('switches protocol and credential type from dropdowns on mobile', async () => {
    mockIsMobile = true;
    const user = renderStep();
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'Aries|anoncreds-indy',
      ),
    );

    await user.click(screen.getByRole('button', { name: /Aries/ }));
    await user.click(
      await screen.findByRole('option', { name: ProtocolType.Oid4vc }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'OpenId4VC|vc+sd-jwt',
      ),
    );

    await user.click(screen.getByRole('button', { name: /OpenId4VC/ }));
    await user.click(
      await screen.findByRole('option', { name: ProtocolType.Aries }),
    );
    await user.click(screen.getByRole('button', { name: /anoncreds-indy/ }));
    await user.click(
      await screen.findByRole('option', { name: 'anoncreds-w3c' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'Aries|anoncreds-w3c',
      ),
    );
  });
});
