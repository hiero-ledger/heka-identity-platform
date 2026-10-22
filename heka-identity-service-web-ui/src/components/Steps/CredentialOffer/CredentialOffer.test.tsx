import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { ConnectionState } from '@/entities/Connection/model/types/connection';
import {
  AnoncredsCredentialState,
  OpenIdIssuanceState,
} from '@/entities/Credential/model/types/credential';
import { ProtocolType } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
} from '@/entities/Schema/model/types/schema';
import {
  INDY_DID,
  KEY_DID,
  indyRegistration,
  registeredSchema,
} from '@/pages/IssueCredential/testUtils';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { CredentialOffer, CredentialOfferContext } from './CredentialOffer';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

// Expose the encoded value; the real component draws an SVG
jest.mock('@/components/QRCode', () => ({
  QRCode: ({ content }: { content: string }) => (
    <div data-testid="qr-code">{content}</div>
  ),
}));

jest.mock('@/shared/lib/notifications', () => ({
  ...jest.requireActual('@/shared/lib/notifications/types'),
  getStatus: () => 'closed',
  onStatusChange: () => () => {},
  subscribe: () => () => {},
}));

const stepDetails = {
  title: 'Credential offer',
  name: 'CredentialOffer',
  next: { title: 'Issue more credential', name: 'SelectProtocolType' },
};

const ariesContext: CredentialOfferContext = {
  protocolType: ProtocolType.Aries,
  credentialType: AriesCredentialFormat.AnoncredsIndy,
  network: 'indy',
  did: INDY_DID,
  schema: registeredSchema,
  credentialValues: { firstName: 'Alice', lastName: 'Smith' },
};

const openIdContext: CredentialOfferContext = {
  protocolType: ProtocolType.Oid4vc,
  credentialType: Openid4CredentialFormat.SdJwt,
  network: 'key',
  did: KEY_DID,
  schema: registeredSchema,
  credentialValues: { firstName: 'Alice', lastName: 'Smith' },
};

const INVITATION = 'https://agent.example/?oob=invitation-1';

/** An agency with one completed connection that answers a credential offer with `offerState`. */
const ariesAgency = (offerState: AnoncredsCredentialState) => {
  const api = createMockApi();
  api.get.mockImplementation((url: string) => {
    if (url === 'connections')
      return Promise.resolve({
        data: [
          {
            id: 'conn-alice',
            state: ConnectionState.Completed,
            role: 'responder',
            createdAt: '2026-10-01T10:00:00Z',
            alias: 'Alice phone',
          },
        ],
      });
    if (url.endsWith('/registration'))
      return Promise.resolve({ data: indyRegistration(registeredSchema.id) });
    return Promise.resolve({ data: undefined });
  });
  api.post.mockImplementation((url: string) => {
    if (url === 'connections/create-invitation')
      return Promise.resolve({
        data: { id: 'oob-1', invitationUrl: INVITATION },
      });
    if (url === '/credentials/offer')
      return Promise.resolve({ data: { id: 'cred-1', state: offerState } });
    return Promise.resolve({ data: undefined });
  });
  return api;
};

const renderOffer = (
  context: CredentialOfferContext,
  api: MockApi,
  demoApi?: MockApi,
) => {
  const onChangeStep = jest.fn();
  const result = renderWithProviders(
    <CredentialOffer
      context={context}
      stepDetails={stepDetails}
      onChangeStep={onChangeStep}
    />,
    { api, demoApi },
  );
  return { ...result, onChangeStep, user: userEvent.setup() };
};

const sendToExistingConnection = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  await user.click(
    await screen.findByRole('button', { name: /Select connection/ }),
  );
  await user.click(await screen.findByRole('option', { name: /^Alice phone/ }));
  await user.click(screen.getByRole('button', { name: 'Send' }));
};

describe('CredentialOffer step', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Aries', () => {
    test('shows the invitation and offers over a chosen existing connection', async () => {
      const api = ariesAgency(AnoncredsCredentialState.OfferSent);
      const { user, onChangeStep } = renderOffer(ariesContext, api);

      expect(screen.getByText('Credential offer')).toBeInTheDocument();
      expect(await screen.findByText(INVITATION)).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith('connections/create-invitation', {
        multiUseInvitation: false,
      });

      await sendToExistingConnection(user);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/credentials/offer',
          expect.objectContaining({
            connectionId: 'conn-alice',
            credentialDefinitionId: `${registeredSchema.id}-cred-def`,
            attributes: [
              { name: 'firstName', value: 'Alice' },
              { name: 'lastName', value: 'Smith' },
            ],
          }),
        ),
      );
      expect(await screen.findByText('Credential Sent')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Issue more credential' }),
      );
      expect(onChangeStep).toHaveBeenCalledWith('SelectProtocolType');
    });

    test('waits for the holder and can fall back to a new QR code', async () => {
      const api = ariesAgency(AnoncredsCredentialState.ProposalReceived);
      const { user } = renderOffer(ariesContext, api);
      await screen.findByText(INVITATION);

      await sendToExistingConnection(user);

      expect(
        await screen.findByText(
          'Credential offer sent. Waiting for the holder to accept it in their wallet.',
        ),
      ).toBeInTheDocument();
      // The scan hint is hidden while an existing connection is used
      expect(screen.queryByText(/Scan QR code/)).toBeNull();
      expect(screen.queryByTestId('qr-code')).toBeNull();

      const invitationsBefore = api.post.mock.calls.filter(
        ([url]) => url === 'connections/create-invitation',
      ).length;
      await user.click(
        screen.getByRole('button', { name: 'Use QR code instead' }),
      );

      await waitFor(() =>
        expect(
          api.post.mock.calls.filter(
            ([url]) => url === 'connections/create-invitation',
          ).length,
        ).toBeGreaterThan(invitationsBefore),
      );
      expect(await screen.findByText(INVITATION)).toBeInTheDocument();
    });

    test('refuses to offer with an incomplete context', async () => {
      const api = ariesAgency(AnoncredsCredentialState.OfferSent);
      const { user } = renderOffer({ ...ariesContext, did: undefined }, api);
      await screen.findByText(INVITATION);

      await sendToExistingConnection(user);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Credential issuance context is invalid',
        ),
      );
      expect(api.post).not.toHaveBeenCalledWith(
        '/credentials/offer',
        expect.anything(),
      );
    });
  });

  describe('OpenID4VC', () => {
    const openIdAgency = (state: OpenIdIssuanceState) => {
      const api = createMockApi();
      api.get.mockResolvedValue({
        data: {
          schemaId: registeredSchema.id,
          credentials: { supportedCredentialId: 'Passport-sd-jwt' },
        },
      });
      api.post.mockResolvedValue({
        data: {
          credentialOffer: 'openid-credential-offer://?offer=abc',
          issuanceSession: { id: 'session-1', state },
        },
      });
      return api;
    };

    test('shows the offer as a QR code until the wallet accepts it', async () => {
      const api = openIdAgency(OpenIdIssuanceState.OfferCreated);
      renderOffer(openIdContext, api);

      expect(
        await screen.findByText('openid-credential-offer://?offer=abc'),
      ).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith(
        '/openid4vc/issuance-session/offer',
        expect.anything(),
      );
      expect(screen.queryByText('Credential Sent')).toBeNull();
    });

    test('offers from the demo agency and hides template saving', async () => {
      const api = createMockApi();
      const demoApi = openIdAgency(OpenIdIssuanceState.Completed);
      renderOffer({ ...openIdContext, useDemo: true }, api, demoApi);

      expect(await screen.findByText('Credential Sent')).toBeInTheDocument();
      expect(demoApi.post).toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Save as template' }),
      ).toBeNull();
    });

    test('saves a sent credential as a template', async () => {
      const api = openIdAgency(OpenIdIssuanceState.Completed);
      const { user } = renderOffer(openIdContext, api);
      await screen.findByText('Credential Sent');

      await user.click(
        screen.getByRole('button', { name: 'Save as template' }),
      );
      await user.type(
        await screen.findByPlaceholderText('Template name'),
        'Sent passport',
      );
      api.post.mockResolvedValueOnce({ data: { id: 'template-9' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/issuance-templates',
          expect.objectContaining({
            name: 'Sent passport',
            protocol: ProtocolType.Oid4vc,
            did: KEY_DID,
          }),
        ),
      );
    });

    test('refuses to offer with an incomplete context', async () => {
      const api = openIdAgency(OpenIdIssuanceState.OfferCreated);
      renderOffer({ ...openIdContext, schema: undefined }, api);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Credential issuance context is invalid',
        ),
      );
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
