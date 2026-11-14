import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import { issuanceTemplateApi } from '@/entities/IssuanceTemplate/api/issuanceTemplateApi';
import {
  cachedQueries,
  dropSessionWhileMounted,
  requestsTo,
} from '@/shared/lib/tests/apiCache';
import {
  LocationDisplay,
  readLocationState,
} from '@/shared/lib/tests/LocationDisplay';
import {
  createMockApi,
  createTestStore,
  renderWithProviders,
  signedInUserState,
} from '@/shared/lib/tests/renderWithProviders';

import { INDY_DID, issuanceTemplate, routeAgencyGets } from '../testUtils';
import { IssueFromTemplate } from './IssueFromTemplate';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const renderIssueFromTemplate = (
  state: unknown = {
    context: { templateId: issuanceTemplate.id },
  },
) => {
  const api = createMockApi();
  routeAgencyGets(api);
  const result = renderWithProviders(
    <>
      <IssueFromTemplate />
      <LocationDisplay />
    </>,
    {
      api,
      route: { pathname: ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE, state },
    },
  );
  return { ...result, user: userEvent.setup() };
};

describe('IssueFromTemplate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('goes back to the templates when opened without a template', () => {
    // e.g. the page was opened in a new tab or its URL typed in
    const { api } = renderIssueFromTemplate(null);

    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
    );
    expect(api.get).not.toHaveBeenCalled();
  });

  test('goes back to the templates when the template cannot be loaded', async () => {
    const api = createMockApi();
    api.get.mockImplementation((url: string) =>
      url === '/issuance-templates'
        ? Promise.resolve({ data: { items: [issuanceTemplate] } })
        : Promise.reject({
            response: { status: 404, data: { message: 'Template not found' } },
          }),
    );
    // The list was shown before (cached, no longer subscribed)
    const store = createTestStore(signedInUserState(), api);
    const list = store.dispatch(
      issuanceTemplateApi.endpoints.getIssuanceTemplateList.initiate(),
    );
    await list;
    list.unsubscribe();

    renderWithProviders(
      <>
        <IssueFromTemplate />
        <LocationDisplay />
      </>,
      {
        api,
        route: {
          pathname: ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
          state: { context: { templateId: 'gone' } },
        },
        store,
      },
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
      ),
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Template not found');
    // Deleted elsewhere: the cached list is dropped, so the list page reads it again
    await waitFor(() =>
      expect(cachedQueries(store)).not.toContain(
        'getIssuanceTemplateList(undefined)',
      ),
    );
  });

  test('reads the template from the cache when opened again', async () => {
    const { api, store, unmount } = renderIssueFromTemplate();
    await screen.findByText('Template: My passport template');
    unmount();

    renderWithProviders(<IssueFromTemplate />, {
      api,
      store,
      route: {
        pathname: ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
        state: { context: { templateId: issuanceTemplate.id } },
      },
    });

    expect(
      screen.getByText('Template: My passport template'),
    ).toBeInTheDocument();
    expect(requestsTo(api, `/issuance-templates/${issuanceTemplate.id}`)).toBe(
      1,
    );
  });

  test('prefills the form from the template and issues with its target', async () => {
    const { user, api } = renderIssueFromTemplate();

    expect(
      await screen.findByText('Template: My passport template'),
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      `/issuance-templates/${issuanceTemplate.id}`,
      { params: undefined },
    );
    expect(screen.getByText('Issue new credential')).toBeInTheDocument();
    expect(screen.getByText(`DID: ${INDY_DID}`)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('firstName')).toHaveValue('Alice'),
    );
    expect(screen.getByPlaceholderText('lastName')).toHaveValue('Smith');

    await user.clear(screen.getByPlaceholderText('lastName'));
    await user.type(screen.getByPlaceholderText('lastName'), 'Jones');
    await user.click(screen.getByRole('button', { name: 'Issue' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        ROUTES.CREDENTIAL_OFFER,
      ),
    );
    expect(
      readLocationState(screen.getByTestId('location-state')).context,
    ).toEqual({
      templateId: issuanceTemplate.id,
      protocolType: issuanceTemplate.protocol,
      credentialType: issuanceTemplate.credentialFormat,
      network: issuanceTemplate.network,
      did: issuanceTemplate.did,
      schema: issuanceTemplate.schema,
      credentialValues: { firstName: 'Alice', lastName: 'Jones' },
    });
  });

  test('does not issue with an empty field', async () => {
    const { user } = renderIssueFromTemplate();
    const lastName = await screen.findByPlaceholderText('lastName');
    await waitFor(() => expect(lastName).toHaveValue('Smith'));

    await user.clear(lastName);
    await user.click(screen.getByRole('button', { name: 'Issue' }));

    expect(await screen.findByText('lastName is required')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
    );
  });

  test('saves the edited values back to the template', async () => {
    const { user, api } = renderIssueFromTemplate();
    const firstName = await screen.findByPlaceholderText('firstName');
    await waitFor(() => expect(firstName).toHaveValue('Alice'));

    await user.clear(firstName);
    await user.type(firstName, 'Bob');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        `/issuance-templates/${issuanceTemplate.id}`,
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ value: 'Bob' }),
          ]),
        }),
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Template was updated successfully',
      ),
    );
    // The saved template is read back once
    await waitFor(() =>
      expect(
        requestsTo(api, `/issuance-templates/${issuanceTemplate.id}`),
      ).toBe(2),
    );
  });

  test('reports nothing extra when saving the template fails', async () => {
    const { user, api } = renderIssueFromTemplate();
    await screen.findByPlaceholderText('firstName');

    api.patch.mockRejectedValueOnce({
      response: { data: { message: 'Template is locked' } },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Template is locked'),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('saves the values as a new template', async () => {
    const { user, api } = renderIssueFromTemplate();
    await screen.findByPlaceholderText('firstName');

    await user.click(screen.getByRole('button', { name: 'Save as' }));
    await user.type(
      await screen.findByPlaceholderText('Template name'),
      'Copy of passport',
    );
    api.post.mockResolvedValueOnce({ data: { id: 'template-2' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/issuance-templates',
        expect.objectContaining({ name: 'Copy of passport' }),
      ),
    );
  });

  test('sends nothing when the session drops while the page is open', async () => {
    const { api, store } = renderIssueFromTemplate();
    await screen.findByText('Template: My passport template');

    await dropSessionWhileMounted(store);

    expect(requestsTo(api, `/issuance-templates/${issuanceTemplate.id}`)).toBe(
      1,
    );
  });
});
