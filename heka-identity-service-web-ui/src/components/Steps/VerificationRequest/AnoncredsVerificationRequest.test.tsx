import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { ConnectionState } from '@/entities/Connection/model/types/connection';
import { AnoncredsPresentationState } from '@/entities/Presentation/model/types/presentation';
import {
  AriesCredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { makeSchema } from '@/pages/VerifyCredential/testUtils';
import { PresentationRequestStep } from '@/pages/VerifyCredential/VerifyCredential.config';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { PresentationRequestContext } from './VerificationRequest';
import { VerificationRequest } from './VerificationRequest';

jest.mock('@/components/QRCode', () => ({
  QRCode: jest.requireActual('./testUtils').QRCodeStub,
}));
jest.mock('@/shared/ui/Select', () => ({
  Select: jest.requireActual('./testUtils').SelectStub,
}));

const schema = makeSchema({
  registrations: [
    {
      schemaId: 'schema-1',
      protocol: ProtocolType.Aries,
      credentialFormat: 'anoncreds',
      network: 'indy',
      did: 'did:indy:issuer',
      credentials: {
        issuerId: 'did:indy:issuer',
        schemaId: 'indy-schema-1',
        credentialDefinitionId: 'cred-def-1',
      },
    },
  ],
});

const context: PresentationRequestContext = {
  protocolType: ProtocolType.Aries,
  credentialType: AriesCredentialFormat.AnoncredsIndy,
  schema,
  attributes: ['firstName', 'age'],
};

const existingConnection = {
  id: 'conn-1',
  state: ConnectionState.Completed,
  role: 'responder',
  createdAt: '2026-10-01T10:00:00Z',
  alias: 'Alice',
};

const stubAgency = (api: MockApi) => {
  api.post.mockImplementation((url: string) => {
    if (url === 'connections/create-invitation') {
      return Promise.resolve({
        data: { id: 'oob-1', invitationUrl: 'didcomm://invite' },
      });
    }
    if (url === '/proofs/request') {
      return Promise.resolve({
        data: { id: 'proof-1', state: AnoncredsPresentationState.RequestSent },
      });
    }
    return Promise.resolve({ data: undefined });
  });
  api.get.mockImplementation((url: string) => {
    if (url === 'connections') {
      return Promise.resolve({ data: [existingConnection] });
    }
    if (url === 'proofs/proof-1') {
      return Promise.resolve({
        data: {
          state: AnoncredsPresentationState.Done,
          revealedAttributes: [
            { name: 'age', value: '42' },
            { name: 'firstName', value: 'Alice' },
          ],
        },
      });
    }
    return Promise.resolve({ data: null });
  });
};

const renderRequest = (
  ctx: PresentationRequestContext = context,
  apis: { api?: MockApi; demoApi?: MockApi } = {},
) => {
  const onChangeStep = jest.fn();
  const view = renderWithProviders(
    <VerificationRequest
      context={ctx}
      stepDetails={PresentationRequestStep}
      onChangeStep={onChangeStep}
    />,
    apis,
  );
  return { ...view, onChangeStep };
};

describe('AnoncredsVerificationRequest', () => {
  test('shows the invitation QR code for a new connection', async () => {
    const api = createMockApi();
    stubAgency(api);
    renderRequest(context, { api });

    expect(await screen.findByTestId('qr')).toHaveTextContent(
      'didcomm://invite',
    );
    expect(
      screen.getByText(/Scan QR code with your mobile wallet/),
    ).toBeVisible();
    expect(
      screen.getByText('Credential verification request'),
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('connections/create-invitation', {
      multiUseInvitation: false,
    });
  });

  test('uses the demo agency for demo flows', async () => {
    const demoApi = createMockApi();
    stubAgency(demoApi);
    const { api } = renderRequest({ ...context, useDemo: true }, { demoApi });

    expect(await screen.findByTestId('qr')).toBeInTheDocument();
    expect(demoApi.post).toHaveBeenCalledWith(
      'connections/create-invitation',
      expect.anything(),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  test('sends the request over an existing connection and shows the shared attributes once received', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    stubAgency(api);
    const { onChangeStep } = renderRequest(context, { api });

    const select = await screen.findByRole('combobox', {
      name: 'Select connection',
    });
    await user.selectOptions(select, 'conn-1');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(
        'Verification request sent. Waiting for the holder to respond in their wallet.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/proofs/request',
        expect.objectContaining({ connectionId: 'conn-1' }),
      ),
    );

    // The pending request is polled until the holder answers
    expect(
      await screen.findByText('Credential verified', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    const names = screen
      .getAllByText(/^(firstName|age)$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['firstName', 'age']);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Verify more credential' }),
    );
    expect(onChangeStep).toHaveBeenCalledWith('SelectProtocolType');
  });

  test('goes back to a fresh QR invitation from an existing connection', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    stubAgency(api);
    renderRequest(context, { api });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Select connection' }),
      'conn-1',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.click(
      await screen.findByRole('button', { name: 'Use QR code instead' }),
    );

    expect(await screen.findByTestId('qr')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        api.post.mock.calls.filter(
          ([url]) => url === 'connections/create-invitation',
        ),
      ).toHaveLength(2),
    );
  });

  test('refuses to send a request with an incomplete context', async () => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    const api = createMockApi();
    stubAgency(api);
    renderRequest({ ...context, attributes: undefined }, { api });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Select connection' }),
      'conn-1',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Credential verification context is invalid',
      ),
    );
    expect(api.post).not.toHaveBeenCalledWith(
      '/proofs/request',
      expect.anything(),
    );
  });
});
