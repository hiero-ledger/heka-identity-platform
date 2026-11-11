import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { IssuedCredentials } from './IssuedCredentials';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const apiError = (status: number, message: string) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const anoncredsActive = {
  id: 'cred-active',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  state: 'done',
  role: 'issuer',
  revocable: true,
  revoked: false,
  credentialDefinitionId: 'creddef-passport',
  format: 'anoncreds-w3c',
  credentialAttributes: [{ name: 'firstName', value: 'Alice' }],
};

const anoncredsRevoked = {
  ...anoncredsActive,
  id: 'cred-revoked',
  createdAt: '2025-12-01T10:00:00.000Z',
  updatedAt: '2025-12-01T10:00:00.000Z',
  revoked: true,
  credentialDefinitionId: 'creddef-revoked',
  format: 'anoncreds-indy',
  credentialAttributes: undefined,
};

const anoncredsUnknown = {
  ...anoncredsActive,
  id: 'cred-unknown',
  createdAt: '2025-11-01T10:00:00.000Z',
  updatedAt: undefined,
  revoked: undefined,
  credentialDefinitionId: 'creddef-unknown',
  // An identity service that could not determine the format
  format: undefined,
  credentialAttributes: undefined,
};

const jwtSession = {
  id: 'session-jwt',
  createdAt: '2026-01-03T10:00:00.000Z',
  publicIssuerId: 'issuer-1',
  state: 'Completed',
  revocable: false,
  issuanceMetadata: {
    credentials: [
      {
        format: 'jwt_vc_json',
        credentialSupportedId: 'DiplomaJwt',
        issuer: { did: 'did:key:issuer' },
        credentialSubject: { degree: 'Master of Secrets' },
      },
    ],
  },
  credentialOfferPayload: { credential_configuration_ids: ['DiplomaJwt'] },
};

const sdJwtSession = {
  id: 'session-sd-jwt',
  createdAt: '2025-10-01T10:00:00.000Z',
  publicIssuerId: 'issuer-2',
  state: 'Completed',
  revocable: true,
  revoked: false,
  issuanceMetadata: {
    credentials: [
      {
        format: 'vc+sd-jwt',
        credentialSupportedId: 'IdentitySdJwt',
        issuer: { did: 'did:key:sdjwt-issuer' },
        payload: { given_name: 'Secret Name' },
      },
    ],
  },
  credentialOfferPayload: { credential_configuration_ids: ['IdentitySdJwt'] },
};

const schemas = [
  {
    id: 'schema-passport',
    name: 'Passport',
    isHidden: false,
    orderIndex: 0,
    fields: [],
    registrations: [
      {
        schemaId: 'schema-passport',
        protocol: 'Aries',
        credentialFormat: 'anoncreds',
        network: 'indy',
        did: 'did:indy:issuer',
        credentials: {
          issuerId: 'did:indy:issuer',
          schemaId: 's',
          credentialDefinitionId: 'creddef-passport',
        },
      },
    ],
  },
];

const routeGets = (
  api: MockApi,
  {
    anoncreds = [anoncredsActive, anoncredsRevoked, anoncredsUnknown],
    sessions = [jwtSession],
  }: { anoncreds?: unknown[]; sessions?: unknown[] } = {},
) =>
  api.get.mockImplementation((url: string) => {
    if (url === agencyEndpoints.getAnoncredsCredentials)
      return Promise.resolve({ data: anoncreds });
    if (url === agencyEndpoints.getOpenIdIssuanceSessions)
      return Promise.resolve({ data: sessions });
    if (url === agencyEndpoints.getSchemaList)
      return Promise.resolve({ data: { items: schemas } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

const renderPage = (api: MockApi = createMockApi()) => {
  const result = renderWithProviders(<IssuedCredentials />, { api });
  return { ...result, user: userEvent.setup() };
};

const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

const openDetails = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
  return screen.findByRole('dialog');
};

const fieldLabels = (dialog: HTMLElement) =>
  Array.from(dialog.querySelectorAll('dt')).map((term) => term.textContent);

const fieldValue = (dialog: HTMLElement, label: string) =>
  Array.from(dialog.querySelectorAll('dt')).find(
    (term) => term.textContent === label,
  )?.nextElementSibling?.textContent;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('IssuedCredentials page', () => {
  test('shows a loader while loading', () => {
    const api = createMockApi();
    api.get.mockReturnValue(new Promise(() => undefined));
    renderPage(api);

    expect(screen.getByLabelText('Loading issued credentials')).toBeInTheDocument();
  });

  test('shows an empty state when nothing has been issued', async () => {
    const api = createMockApi();
    routeGets(api, { anoncreds: [], sessions: [] });
    renderPage(api);

    expect(await screen.findByText('No issued credentials yet')).toBeInTheDocument();
  });

  test('shows the error with Retry, and Retry reloads the list', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue(apiError(500, 'Service unavailable'));
    const { user } = renderPage(api);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load the issued credentials.')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Service unavailable');

    routeGets(api);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Passport')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('lists both protocols newest first with the status of each credential', async () => {
    const api = createMockApi();
    routeGets(api);
    renderPage(api);

    await screen.findByText('Passport');
    // The first column is the Heka schema name (with the raw ids as fallback)
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: /DIDComm|OpenID4VC/ });
    expect(rows.map((row) => within(row).getAllByText(/./)[0].textContent)).toEqual([
      'DiplomaJwt',
      'Passport',
      'creddef-revoked',
      'creddef-unknown',
    ]);
    expect(within(rows[0]).getByText('OpenID4VC')).toBeInTheDocument();
    expect(within(rows[0]).getByText('jwt_vc_json')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Not revocable')).toBeInTheDocument();
    expect(within(rows[1]).getByText('DIDComm')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Active')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Revoked')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Status unknown')).toBeInTheDocument();
  });

  test('shows the DIDComm format from the identity service, and the generic anoncreds without it', async () => {
    const api = createMockApi();
    routeGets(api);
    renderPage(api);

    await screen.findByText('Passport');
    const rows = screen.getAllByRole('button', { name: /DIDComm/ });
    expect(rows.map((row) => row.children[2].textContent)).toEqual([
      'anoncreds-w3c',
      'anoncreds-indy',
      'anoncreds',
    ]);
  });

  test('gives every cell its full value as a title, since cells are truncated with an ellipsis', async () => {
    const api = createMockApi();
    routeGets(api);
    renderPage(api);

    await screen.findByText('Passport');
    const rows = screen.getAllByRole('button', { name: /DIDComm|OpenID4VC/ });
    for (const row of rows) {
      const cells = Array.from(row.children);
      expect(cells).toHaveLength(5);
      cells.forEach((cell) => {
        expect(cell.textContent).not.toBe('');
        expect(cell).toHaveAttribute('title', cell.textContent);
      });
    }
    expect(within(rows[0]).getByTitle('OpenID4VC')).toBeInTheDocument();
  });

  test('opens the details by click, without claims', async () => {
    const api = createMockApi();
    routeGets(api);
    const { user } = renderPage(api);

    const dialog = await openDetails(user, 'Passport');

    expect(within(dialog).getByRole('heading', { name: 'Passport' })).toBeInTheDocument();
    // The resolved schema is labelled, so users see that the title is the schema name
    expect(fieldValue(dialog, 'Schema')).toBe('Passport');
    expect(fieldLabels(dialog).slice(0, 3)).toEqual(['Schema', 'Protocol', 'Format']);
    expect(within(dialog).getByText('Credential definition ID')).toBeInTheDocument();
    expect(within(dialog).getByText('creddef-passport')).toBeInTheDocument();
    expect(within(dialog).getByText('Record ID')).toBeInTheDocument();
    expect(within(dialog).getByText('cred-active')).toBeInTheDocument();
    expect(within(dialog).getByText('Format')).toBeInTheDocument();
    expect(within(dialog).getByText('anoncreds-w3c')).toBeInTheDocument();
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(within(dialog).queryByText(/firstName|Alice/)).not.toBeInTheDocument();
  });

  test.each(['{Enter}', ' '])('opens the details with %p on a focused row', async (key) => {
    const api = createMockApi();
    routeGets(api);
    const { user } = renderPage(api);

    await screen.findByText('Passport');
    rowOf('Passport').focus();
    await user.keyboard(key);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('jwt_vc_json credentials are not revocable and have no Revoke button', async () => {
    const api = createMockApi();
    routeGets(api);
    const { user } = renderPage(api);

    const dialog = await openDetails(user, 'DiplomaJwt');

    expect(within(dialog).getByText('Not revocable')).toBeInTheDocument();
    // No schema resolved: no Schema row repeating the configuration id of the title
    expect(fieldLabels(dialog)).not.toContain('Schema');
    expect(fieldLabels(dialog)[0]).toBe('Protocol');
    expect(within(dialog).getByText('did:key:issuer')).toBeInTheDocument();
    expect(within(dialog).getByText('Credential configuration(s)')).toBeInTheDocument();
    expect(within(dialog).queryByText('Master of Secrets')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  test('a revoked credential has no Revoke button', async () => {
    const api = createMockApi();
    routeGets(api);
    const { user } = renderPage(api);

    const dialog = await openDetails(user, 'creddef-revoked');

    expect(within(dialog).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  test.each([
    ['Cancel', async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) =>
      user.keyboard('{Escape}')],
  ])('closing the confirmation with %s sends no request', async (_, close) => {
    const api = createMockApi();
    routeGets(api);
    const { user } = renderPage(api);

    const dialog = await openDetails(user, 'Passport');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(
      await screen.findByRole('heading', { name: 'Revoke this credential?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Revocation cannot be undone.')).toBeInTheDocument();

    await close(user);

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Revoke this credential?' }),
      ).not.toBeInTheDocument(),
    );
    expect(api.post).not.toHaveBeenCalled();
    // Only the confirmation closes; the details stay open
    expect(screen.getByRole('dialog', { name: 'Passport' })).toBeInTheDocument();
  });

  const acceptRevocation = async (
    user: ReturnType<typeof userEvent.setup>,
    name = 'Passport',
  ) => {
    const details = await openDetails(user, name);
    await user.click(within(details).getByRole('button', { name: 'Revoke' }));
    const confirmation = await screen.findByRole('dialog', {
      name: 'Revoke this credential?',
    });
    await user.click(within(confirmation).getByRole('button', { name: 'Revoke' }));
  };

  const detailsDialog = (name = 'Passport') =>
    screen.findByRole('dialog', { name });

  test('an SD-JWT VC session is Active and revokes through the OpenID4VC endpoint', async () => {
    const api = createMockApi();
    routeGets(api, { sessions: [jwtSession, sdJwtSession] });
    api.post.mockResolvedValue({ data: undefined });
    const { user } = renderPage(api);

    await screen.findByText('IdentitySdJwt');
    const row = rowOf('IdentitySdJwt');
    expect(within(row).getByText('vc+sd-jwt')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();

    await acceptRevocation(user, 'IdentitySdJwt');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Credential revoked'),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      '/openid4vc/issuance-session/session-sd-jwt/revoke',
    );
    const details = await detailsDialog('IdentitySdJwt');
    expect(within(details).getByText('Revoked')).toBeInTheDocument();
    expect(within(details).queryByText('Secret Name')).not.toBeInTheDocument();
    expect(
      within(details).queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
  });

  test('an already revoked SD-JWT VC session is marked Revoked without an error', async () => {
    const api = createMockApi();
    routeGets(api, { sessions: [sdJwtSession] });
    api.post.mockRejectedValue(apiError(409, 'Credential is already revoked'));
    const { user } = renderPage(api);

    await acceptRevocation(user, 'IdentitySdJwt');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'The credential was already revoked',
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      within(await detailsDialog('IdentitySdJwt')).getByText('Revoked'),
    ).toBeInTheDocument();
  });

  test('a revoked SD-JWT VC session loads as Revoked, without a Revoke button', async () => {
    const api = createMockApi();
    routeGets(api, { sessions: [{ ...sdJwtSession, revoked: true }] });
    const { user } = renderPage(api);

    const dialog = await openDetails(user, 'IdentitySdJwt');

    expect(within(dialog).getByText('Revoked')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  test('accepting revokes the credential and shows Revoked without a reload', async () => {
    const api = createMockApi();
    routeGets(api);
    api.post.mockResolvedValue({ data: undefined });
    const { user } = renderPage(api);

    await acceptRevocation(user);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Credential revoked'),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/credentials/cred-active/revoke');
    const details = await detailsDialog();
    expect(within(details).getByText('Revoked')).toBeInTheDocument();
    expect(
      within(details).queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
    // The list was loaded once (3 requests): the new status comes from the store, not a reload
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  test('an already revoked credential is marked Revoked with its own message', async () => {
    const api = createMockApi();
    routeGets(api);
    api.post.mockRejectedValue(apiError(409, 'Credential is already revoked.'));
    const { user } = renderPage(api);

    await acceptRevocation(user);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'The credential was already revoked',
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(within(await detailsDialog()).getByText('Revoked')).toBeInTheDocument();
  });

  test('another error shows the server message, keeps the status and disables Revoke only while in flight', async () => {
    const api = createMockApi();
    routeGets(api);
    let rejectPost: (reason: unknown) => void = () => undefined;
    api.post.mockReturnValue(
      new Promise((_, reject) => {
        rejectPost = reject;
      }),
    );
    const { user } = renderPage(api);

    await acceptRevocation(user);

    const details = await detailsDialog();
    await waitFor(() =>
      expect(within(details).getByRole('button', { name: 'Revoke' })).toBeDisabled(),
    );

    rejectPost(apiError(403, 'Forbidden resource'));

    await waitFor(() =>
      expect(within(details).getByRole('button', { name: 'Revoke' })).toBeEnabled(),
    );
    expect(toast.error).toHaveBeenCalledWith('Forbidden resource');
    expect(toast.success).not.toHaveBeenCalled();
    expect(within(details).getByText('Active')).toBeInTheDocument();
  });
});
