import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { verificationTemplateApi } from '@/entities/VerificationTemplate/api/verificationTemplateApi';
import { VerificationTemplate } from '@/entities/VerificationTemplate/model/types/verificationTemplate';
import { makeVerificationTemplate } from '@/pages/VerifyCredential/testUtils';
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

import { VerificationFromTemplate } from './VerificationFromTemplate';

const renderPage = (template?: VerificationTemplate) => {
  const api = createMockApi();
  if (template) api.get.mockResolvedValue({ data: template });
  const view = renderWithProviders(
    <>
      <VerificationFromTemplate />
      <LocationDisplay />
    </>,
    {
      api,
      route: {
        pathname: ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
        state: template ? { context: { templateId: template.id } } : null,
      },
    },
  );
  return view;
};

const checkbox = (name: string) =>
  screen
    .getAllByRole('checkbox')
    .find((el) => el.getAttribute('name') === name) as HTMLInputElement;

describe('VerificationFromTemplate', () => {
  test('goes back to the templates when opened without a template', () => {
    // e.g. the page was opened in a new tab or its URL typed in
    const { api } = renderPage();

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
    );
  });

  test('goes back to the templates when the template cannot be loaded', async () => {
    const toastError = jest.spyOn(toast, 'error');
    const api = createMockApi();
    api.get.mockImplementation((url: string) =>
      url === '/verification-templates'
        ? Promise.resolve({ data: { items: [makeVerificationTemplate()] } })
        : Promise.reject({
            response: { status: 404, data: { message: 'Template not found' } },
          }),
    );
    // The list was shown before (cached, no longer subscribed)
    const store = createTestStore(signedInUserState(), api);
    const list = store.dispatch(
      verificationTemplateApi.endpoints.getVerificationTemplateList.initiate(),
    );
    await list;
    list.unsubscribe();

    renderWithProviders(
      <>
        <VerificationFromTemplate />
        <LocationDisplay />
      </>,
      {
        api,
        store,
        route: {
          pathname: ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
          state: { context: { templateId: 'gone' } },
        },
      },
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
      ),
    );
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Template not found');
    // Deleted elsewhere: the cached list is dropped, so the list page reads it again
    await waitFor(() =>
      expect(cachedQueries(store)).not.toContain(
        'getVerificationTemplateList(undefined)',
      ),
    );
    toastError.mockRestore();
  });

  test('reads the template from the cache when opened again', async () => {
    const template = makeVerificationTemplate();
    const { api, store, unmount } = renderPage(template);
    await screen.findByText('Template: KYC check');
    unmount();

    renderWithProviders(<VerificationFromTemplate />, {
      api,
      store,
      route: {
        pathname: ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
        state: { context: { templateId: template.id } },
      },
    });

    expect(screen.getByText('Template: KYC check')).toBeInTheDocument();
    expect(requestsTo(api, '/verification-templates/tpl-1')).toBe(1);
  });

  test('shows the template and requests the selected fields', async () => {
    const user = userEvent.setup();
    const { api } = renderPage(makeVerificationTemplate());

    expect(await screen.findByText('Template: KYC check')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/verification-templates/tpl-1', {
      params: undefined,
    });
    expect(screen.getByText('Passport')).toBeInTheDocument();
    expect(screen.getByText('Request fields verification')).toBeInTheDocument();
    expect(
      screen.getByText('Protocol: Aries; Credential type: anoncreds-indy'),
    ).toBeInTheDocument();
    expect(checkbox('firstName')).toBeChecked();
    expect(checkbox('age')).not.toBeChecked();

    await user.click(checkbox('age'));
    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.VERIFICATION_REQUEST,
    );
    expect(readLocationState(screen.getByTestId('location-state'))).toEqual({
      context: {
        templateId: 'tpl-1',
        protocolType: ProtocolType.Aries,
        credentialType: AriesCredentialFormat.AnoncredsIndy,
        network: 'indy',
        did: 'did:indy:issuer',
        schema: expect.objectContaining({ id: 'schema-1' }),
        attributes: ['firstName', 'age'],
      },
    });
  });

  test('disables Request when nothing is selected', async () => {
    const user = userEvent.setup();
    renderPage(makeVerificationTemplate());

    await screen.findByText('Template: KYC check');
    await user.click(checkbox('firstName'));

    expect(screen.getByRole('button', { name: 'Request' })).toBeDisabled();
  });

  test('locks the selection for formats without selective disclosure', async () => {
    renderPage(
      makeVerificationTemplate({
        protocol: ProtocolType.Oid4vc,
        credentialFormat: Openid4CredentialFormat.JwtJson,
      }),
    );

    await screen.findByText('Template: KYC check');
    expect(checkbox('firstName')).toBeDisabled();
  });

  test('keeps selective disclosure for SD-JWT templates', async () => {
    renderPage(
      makeVerificationTemplate({
        protocol: ProtocolType.Oid4vc,
        credentialFormat: Openid4CredentialFormat.SdJwt,
      }),
    );

    await screen.findByText('Template: KYC check');
    expect(checkbox('firstName')).toBeEnabled();
  });

  test('saves the changed selection to the template', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const { api } = renderPage(makeVerificationTemplate());

    await screen.findByText('Template: KYC check');
    await user.click(checkbox('lastName'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('Template was updated successfully'),
    );
    expect(api.patch).toHaveBeenCalledWith(
      '/verification-templates/tpl-1',
      expect.objectContaining({
        schemaId: 'schema-1',
        fields: [{ schemaFieldId: 'f-1' }, { schemaFieldId: 'f-2' }],
      }),
    );
    // The saved template is read back once
    await waitFor(() =>
      expect(requestsTo(api, '/verification-templates/tpl-1')).toBe(2),
    );
  });

  test('does not report success when saving fails', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const { api } = renderPage(makeVerificationTemplate());
    api.patch.mockRejectedValue({
      response: { data: { message: 'Nope' } },
    });

    await screen.findByText('Template: KYC check');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
  });

  test('saves the selection as a new template', async () => {
    const user = userEvent.setup();
    const { api } = renderPage(makeVerificationTemplate());
    api.post.mockResolvedValue({ data: makeVerificationTemplate() });

    await screen.findByText('Template: KYC check');
    await user.click(screen.getByRole('button', { name: 'Save as' }));
    await user.type(await screen.findByRole('textbox'), 'Copy');
    await user.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/verification-templates',
        expect.objectContaining({
          name: 'Copy',
          schemaId: 'schema-1',
          fields: [{ schemaFieldId: 'f-1' }],
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  test('sends nothing when the session drops while the page is open', async () => {
    const { api, store } = renderPage(makeVerificationTemplate());
    await screen.findByText('Template: KYC check');

    await dropSessionWhileMounted(store);

    expect(requestsTo(api, '/verification-templates/tpl-1')).toBe(1);
  });
});
