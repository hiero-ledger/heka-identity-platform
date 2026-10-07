import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ROUTES from '@/app/routes/RoutePaths';
import { OpenIdIssuanceState } from '@/entities/Credential/model/types/credential';
import { ProtocolType } from '@/entities/Schema';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { KEY_DID, LocationProbe, registeredSchema } from '../testUtils';
import CredentialOffer from './CredentialOffer';

jest.mock('@/shared/lib/notifications', () => ({
  ...jest.requireActual('@/shared/lib/notifications/types'),
  getStatus: () => 'closed',
  onStatusChange: () => () => {},
  subscribe: () => () => {},
}));

describe('CredentialOffer page', () => {
  test('renders nothing without a context in the route state', () => {
    const { container } = renderWithProviders(<CredentialOffer />, {
      route: ROUTES.CREDENTIAL_OFFER,
    });
    expect(container).toBeEmptyDOMElement();
  });

  test('offers the credential and returns to the templates once it is sent', async () => {
    const api = createMockApi();
    api.get.mockResolvedValue({
      data: {
        schemaId: registeredSchema.id,
        credentials: { supportedCredentialId: 'Passport-sd-jwt' },
      },
    });
    api.post.mockResolvedValue({
      data: {
        credentialOffer: 'openid-credential-offer://?offer=1',
        issuanceSession: {
          id: 'session-1',
          state: OpenIdIssuanceState.Completed,
        },
      },
    });

    renderWithProviders(
      <>
        <CredentialOffer />
        <LocationProbe />
      </>,
      {
        api,
        route: {
          pathname: ROUTES.CREDENTIAL_OFFER,
          state: {
            context: {
              protocolType: ProtocolType.Oid4vc,
              credentialType: Openid4CredentialFormat.SdJwt,
              network: 'key',
              did: KEY_DID,
              schema: registeredSchema,
              credentialValues: { firstName: 'Alice', lastName: 'Smith' },
            },
          },
        },
      },
    );

    expect(await screen.findByText('Credential Sent')).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Issue more credential' }));

    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent(
        ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
      ),
    );
  });
});
