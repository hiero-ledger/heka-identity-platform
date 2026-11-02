import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { ProtocolType } from '@/entities/Schema';
import { AriesCredentialFormat } from '@/entities/Schema/model/types/schema';
import { IssueCredentialContext } from '@/pages/IssueCredential/IssueCredential.config';
import { INDY_DID, registeredSchema } from '@/pages/IssueCredential/testUtils';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { FillCredentialData } from './FillCredentialData';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const context: IssueCredentialContext = {
  wizardType: 'demo',
  protocolType: ProtocolType.Aries,
  credentialType: AriesCredentialFormat.AnoncredsIndy,
  network: 'indy',
  did: INDY_DID,
  schema: registeredSchema,
  credentialValues: { firstName: 'Alice', lastName: 'Smith' },
};

describe('FillCredentialData', () => {
  beforeEach(() => jest.clearAllMocks());

  test('demo flow can skip or issue the prefilled values', async () => {
    const onNext = jest.fn();
    const onSkip = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <FillCredentialData
        title="Issue new credential"
        context={context}
        onNext={onNext}
        onSkip={onSkip}
      />,
    );

    expect(screen.getByPlaceholderText('firstName')).toHaveValue('Alice');
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Save as template' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Issue' }));
    await waitFor(() =>
      expect(onNext).toHaveBeenCalledWith({
        firstName: 'Alice',
        lastName: 'Smith',
      }),
    );
  });

  test('keeps the template editor open when the update fails', async () => {
    const api = createMockApi();
    api.patch.mockRejectedValueOnce({
      response: { data: { message: 'Template not found' } },
    });
    renderWithProviders(
      <FillCredentialData
        title="Issue new credential"
        context={{
          ...context,
          wizardType: 'template',
          templateId: 'template-1',
          templateName: 'Passport',
        }}
        onNext={jest.fn()}
      />,
      { api, route: '/issue-credential/template' },
    );

    expect(screen.getByText('Edit issuance template')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Template not found'),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Edit issuance template')).toBeInTheDocument();
  });

  test('issue flow opens the save-as-template dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FillCredentialData
        title="Issue new credential"
        context={{ ...context, wizardType: 'issue' }}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save as template' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Template name')).toBeInTheDocument();
  });
});
