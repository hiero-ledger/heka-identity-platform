import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import { ProtocolType } from '@/entities/Schema';
import {
  createMockApi,
  createTestStore,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import {
  INDY_DID,
  LocationProbe,
  readLocationState,
  registeredSchema,
  routeAgencyGets,
  unregisteredSchema,
} from '../testUtils';
import { AdvancedIssue } from './AdvancedIssue';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

// The real modal fetches its default logo on mount; only its contract matters here
jest.mock('@/components/CreateSchema/CreateSchema', () => ({
  CreateSchemaModal: ({
    isOpen,
    onSchemaCreated,
  }: {
    isOpen: boolean;
    onSchemaCreated: (schema: unknown) => void;
  }) =>
    isOpen ? (
      <button
        onClick={() =>
          onSchemaCreated({
            id: 'schema-new',
            name: 'Brand new',
            fields: [{ id: 'f9', name: 'nickname' }],
          })
        }
      >
        create schema stub
      </button>
    ) : null,
}));

const renderAdvancedIssue = (
  type: 'issue' | 'template' = 'issue',
  state?: unknown,
) => {
  const api = createMockApi();
  routeAgencyGets(api);
  const result = renderWithProviders(
    <>
      <AdvancedIssue type={type} />
      <LocationProbe />
    </>,
    {
      api,
      route: { pathname: ROUTES.ISSUE_ADVANCED_ISSUE, state },
    },
  );
  return { ...result, user: userEvent.setup() };
};

const clickNext = async (user: ReturnType<typeof userEvent.setup>) => {
  const next = screen.getByRole('button', { name: /Next/ });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
};

/** Walks the protocol and network steps with the default Aries / indy choices. */
const goToSchemaStep = async (user: ReturnType<typeof userEvent.setup>) => {
  expect(await screen.findByTitle(ProtocolType.Oid4vc)).toBeInTheDocument();
  await clickNext(user);
  expect(await screen.findByText('Select network')).toBeInTheDocument();
  expect(await screen.findByTitle(INDY_DID)).toBeInTheDocument();
  await clickNext(user);
  expect(await screen.findByText('Select schema')).toBeInTheDocument();
};

describe('AdvancedIssue', () => {
  test('resets the templates once when opened', () => {
    const api = createMockApi();
    routeAgencyGets(api);
    const store = createTestStore({}, api);
    const dispatch = jest.spyOn(store, 'dispatch');

    renderWithProviders(<AdvancedIssue />, {
      api,
      store,
      route: ROUTES.ISSUE_ADVANCED_ISSUE,
    });

    const resets = dispatch.mock.calls.filter(
      ([action]) =>
        (action as { type?: string }).type === 'issuanceTemplates/reset',
    );
    expect(resets).toHaveLength(1);
  });

  test('issues a credential for a registered schema and passes the context on', async () => {
    const { user } = renderAdvancedIssue();

    expect(screen.getByText('Select protocol type')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();

    // Switching the protocol offers that protocol's credential formats
    await user.click(await screen.findByTitle(ProtocolType.Oid4vc));
    expect(await screen.findByTitle('vc+sd-jwt')).toBeInTheDocument();
    await user.click(screen.getByTitle(ProtocolType.Aries));
    expect(await screen.findByTitle('anoncreds-w3c')).toBeInTheDocument();
    await clickNext(user);

    expect(await screen.findByText('Select network')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(await screen.findByTitle(INDY_DID)).toBeInTheDocument();
    await clickNext(user);

    expect(await screen.findByText('Select schema')).toBeInTheDocument();
    // The first schema is preselected and its attributes are shown
    expect(await screen.findByText('firstName')).toBeInTheDocument();
    await clickNext(user);

    // Already registered for Aries / indy / the DID, so registration is skipped
    expect(await screen.findByText('Issue new credential')).toBeInTheDocument();
    expect(screen.getByText('Schema: Passport')).toBeInTheDocument();
    expect(screen.getByText(`DID: ${INDY_DID}`)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('firstName'), 'Alice');
    await user.type(screen.getByPlaceholderText('lastName'), 'Smith');
    await user.click(screen.getByRole('button', { name: 'Issue' }));

    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent(
        ROUTES.CREDENTIAL_OFFER,
      ),
    );
    const { context } = readLocationState(screen.getByTestId('location-state'));
    expect(context).toMatchObject({
      wizardType: 'issue',
      protocolType: ProtocolType.Aries,
      credentialType: 'anoncreds-indy',
      network: 'indy',
      did: INDY_DID,
      schema: { id: registeredSchema.id },
      credentialValues: { firstName: 'Alice', lastName: 'Smith' },
    });
  });

  test('does not issue while a credential field is empty', async () => {
    const { user } = renderAdvancedIssue();
    await goToSchemaStep(user);
    await clickNext(user);
    expect(await screen.findByText('Issue new credential')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('firstName'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Issue' }));

    expect(await screen.findByText('lastName is required')).toBeInTheDocument();
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      ROUTES.ISSUE_ADVANCED_ISSUE,
    );
  });

  test('registers an unregistered schema before filling the credential', async () => {
    const { user, api } = renderAdvancedIssue();
    await goToSchemaStep(user);

    await user.click(await screen.findByTitle('Diploma'));
    expect(await screen.findByText('degree')).toBeInTheDocument();
    await clickNext(user);

    expect(
      await screen.findByText('Registration of the schema'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Schema Diploma is not registered in this network'),
    ).toBeInTheDocument();

    // Back returns to the schema step, and Next comes back to registration
    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByText('Select schema')).toBeInTheDocument();
    await clickNext(user);
    expect(
      await screen.findByText('Registration of the schema'),
    ).toBeInTheDocument();

    // Once registered, the agency returns the schema with its new registration
    routeAgencyGets(api, {
      singleSchema: (id) =>
        id === unregisteredSchema.id
          ? {
              ...unregisteredSchema,
              registrations: registeredSchema.registrations!.map((r) => ({
                ...r,
                schemaId: id,
              })),
            }
          : registeredSchema,
    });
    await user.click(screen.getByRole('button', { name: /Register/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        `/v2/schemas/${unregisteredSchema.id}/registration`,
        {
          protocol: ProtocolType.Aries,
          credentialFormat: 'anoncreds',
          network: 'indy',
          did: INDY_DID,
        },
      ),
    );
    expect(await screen.findByText('Issue new credential')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('degree')).toBeInTheDocument();
  });

  test('stays on the registration step when registering fails', async () => {
    const { user, api } = renderAdvancedIssue();
    await goToSchemaStep(user);
    await user.click(await screen.findByTitle('Diploma'));
    await clickNext(user);
    expect(
      await screen.findByText('Registration of the schema'),
    ).toBeInTheDocument();

    api.post.mockRejectedValueOnce({
      response: { data: { message: 'Ledger unavailable' } },
    });
    await user.click(screen.getByRole('button', { name: /Register/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Ledger unavailable'),
    );
    expect(screen.getByText('Registration of the schema')).toBeInTheDocument();
  });

  test('selects a schema created from the schema step', async () => {
    const { user, api } = renderAdvancedIssue();
    await goToSchemaStep(user);
    const schemaListRequests = () =>
      api.get.mock.calls.filter(([url]) => url === '/v2/schemas').length;
    const requestsBefore = schemaListRequests();

    // The plus button has an icon only
    const plusButton = screen
      .getAllByRole('button')
      .find((button) => !button.textContent?.trim());
    await user.click(plusButton!);
    await user.click(
      screen.getByRole('button', { name: 'create schema stub' }),
    );

    // The list is reloaded and the new schema becomes the selection
    await waitFor(() =>
      expect(schemaListRequests()).toBeGreaterThan(requestsBefore),
    );
    expect(await screen.findByText('nickname')).toBeInTheDocument();
  });

  test('network step goes back to the protocol step', async () => {
    const { user } = renderAdvancedIssue();
    await screen.findByTitle(ProtocolType.Oid4vc);
    await clickNext(user);
    expect(await screen.findByText('Select network')).toBeInTheDocument();

    // hedera has no DIDs, so none are offered
    await user.click(screen.getByTitle('hedera'));
    await waitFor(() => expect(screen.queryByTitle(INDY_DID)).toBeNull());

    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByText('Select protocol type')).toBeInTheDocument();
  });

  test('saves the filled data as a new issuance template', async () => {
    const { user, api } = renderAdvancedIssue('template');
    await goToSchemaStep(user);
    await clickNext(user);

    expect(
      await screen.findByText('New issuance template'),
    ).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('firstName'), 'Alice');
    await user.type(screen.getByPlaceholderText('lastName'), 'Smith');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Save as template');

    api.post.mockResolvedValueOnce({ data: { id: 'template-new' } });
    await user.type(
      screen.getByPlaceholderText('Template name'),
      'Passport template',
    );
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/issuance-templates',
        expect.objectContaining({ name: 'Passport template' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent(
        ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
      ),
    );
  });

  test('edits an existing issuance template loaded from the route state', async () => {
    const { user, api } = renderAdvancedIssue('template', {
      context: { templateId: 'template-1' },
    });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/issuance-templates/template-1'),
    );
    await goToSchemaStep(user);
    await clickNext(user);

    expect(
      await screen.findByText('Edit issuance template'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Template: My passport template'),
    ).toBeInTheDocument();

    api.patch.mockResolvedValueOnce({ data: {} });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/issuance-templates/template-1',
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Template My passport template was saved successfully',
      ),
    );
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
    );
  });
});
