import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { ProtocolType, Schema } from '@/entities/Schema';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';
import {
  KEY_DID,
  routeAgencyGets,
  unregisteredSchema,
} from '@/pages/IssueCredential/testUtils';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { SchemaRegistration } from './SchemaRegistration';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const target = {
  protocolType: ProtocolType.Oid4vc,
  credentialType: Openid4CredentialFormat.SdJwt,
  network: 'key',
  did: KEY_DID,
};

describe('SchemaRegistration', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows the registration target', () => {
    renderWithProviders(
      <SchemaRegistration
        title="Registration of the schema"
        schema={unregisteredSchema}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        {...target}
      />,
    );

    expect(screen.getByText('OpenId4VC')).toBeInTheDocument();
    expect(screen.getByText('vc+sd-jwt')).toBeInTheDocument();
    expect(screen.getByText('key')).toBeInTheDocument();
    expect(screen.getByText(KEY_DID)).toBeInTheDocument();
  });

  test('refuses to register without a complete target', async () => {
    const api = createMockApi();
    const onNext = jest.fn();
    renderWithProviders(
      <SchemaRegistration
        title="Registration of the schema"
        schema={unregisteredSchema}
        onPrev={jest.fn()}
        onNext={onNext}
        {...target}
        did={undefined}
      />,
      { api },
    );

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Register/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Schema registration context is invalid',
      ),
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  test('registers the schema, reads it back once and continues with it', async () => {
    const registered: Schema = {
      ...unregisteredSchema,
      registrationsCount: 1,
      registrations: [
        {
          schemaId: unregisteredSchema.id,
          protocol: ProtocolType.Oid4vc,
          credentialFormat: Openid4CredentialFormat.SdJwt,
          network: 'key',
          did: KEY_DID,
        },
      ],
    };
    const api = createMockApi();
    routeAgencyGets(api, { singleSchema: () => registered });
    const onNext = jest.fn();
    const { store } = renderWithProviders(
      <SchemaRegistration
        title="Registration of the schema"
        schema={unregisteredSchema}
        onPrev={jest.fn()}
        onNext={onNext}
        {...target}
      />,
      { api },
    );

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Register/ }));

    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      `/v2/schemas/${unregisteredSchema.id}/registration`,
      expect.objectContaining({ network: 'key', did: KEY_DID }),
    );
    // One read of the schema after the registration (it used to be read twice)
    expect(
      api.get.mock.calls.filter(
        ([url]) => url === `/v2/schemas/${unregisteredSchema.id}`,
      ),
    ).toHaveLength(1);
    expect(store.getState().schemas.schema).toEqual(registered);
  });
});
