import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import Dids from './Dids';
import {
  apiError,
  didRequests,
  HEDERA_DID,
  hederaDoc,
  INDY_DID,
  indyDoc,
  KEY_DID,
  keyDoc,
  routeDidGets,
} from './testUtils';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const renderList = (api = createMockApi()) =>
  renderWithProviders(
    <Routes>
      <Route
        path={ROUTES.DIDS}
        element={<Dids />}
      />
      <Route
        path={ROUTES.DID_DETAILS}
        element={<LocationDisplay />}
      />
    </Routes>,
    { api, route: ROUTES.DIDS },
  );

const rows = () =>
  screen.getAllByRole('listitem').map((item) => within(item).getByRole('link'));

describe('Dids', () => {
  test('lists one row per DID ordered by the configured methods (AC3, AC4)', async () => {
    const api = createMockApi();
    routeDidGets(api, {
      methods: ['indy', 'key', 'hedera'],
      dids: { hedera: [hederaDoc], key: [keyDoc], indy: [indyDoc] },
    });

    renderList(api);

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    expect(didRequests(api)).toEqual([
      { own: true, method: 'indy' },
      { own: true, method: 'key' },
      { own: true, method: 'hedera' },
    ]);

    const [indy, key, hedera] = rows();
    expect(indy).toHaveTextContent(INDY_DID);
    expect(key).toHaveTextContent(KEY_DID);
    expect(hedera).toHaveTextContent(HEDERA_DID);

    // The DID (also in `title`), its method and the verification-method and service counts
    expect(within(hedera).getByTitle(HEDERA_DID)).toHaveTextContent(HEDERA_DID);
    expect(hedera).toHaveAccessibleName(
      `${HEDERA_DID}, method hedera, verification methods: 2, services: 2`,
    );
    expect(indy).toHaveAccessibleName(
      `${INDY_DID}, method indy, verification methods: 1, services: 1`,
    );
    expect(key).toHaveAccessibleName(
      `${KEY_DID}, method key, verification methods: 1, services: 0`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows an accessible loader while the requests are pending (AC5)', async () => {
    const api = createMockApi();
    api.get.mockReturnValue(new Promise(() => {}));

    renderList(api);

    expect(
      await screen.findByRole('status', { name: 'Loading DIDs' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('shows the error with Retry when every method fails, and the list after a retry (AC5)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    routeDidGets(api, {
      methods: ['key', 'hedera'],
      dids: { key: apiError('Wallet busy'), hedera: apiError('Wallet busy') },
    });

    renderList(api);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the DIDs.');
    expect(alert).toHaveTextContent('Wallet busy');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    routeDidGets(api, {
      methods: ['key', 'hedera'],
      dids: { key: [keyDoc], hedera: [hederaDoc] },
    });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the error with Retry when the methods cannot be read (AC5)', async () => {
    const api = createMockApi();
    routeDidGets(api, { methods: apiError('Service unavailable', 503) });

    renderList(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Service unavailable',
    );
    expect(didRequests(api)).toEqual([]);
  });

  test('a failed method shows the other DIDs and a warning with Retry, without a toast (AC5a)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    routeDidGets(api, {
      dids: {
        indy: [indyDoc],
        key: [keyDoc],
        hedera: apiError('Mirror node timeout'),
      },
    });

    renderList(api);

    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining(INDY_DID),
      expect.stringContaining(KEY_DID),
    ]);
    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent(
      'Could not load hedera DIDs: Mirror node timeout',
    );
    expect(toast.error).not.toHaveBeenCalled();

    routeDidGets(api);
    await user.click(within(warning).getByRole('button', { name: 'Retry' }));

    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(rows()[2]).toHaveTextContent(HEDERA_DID);
  });

  test('shows server messages as they are, without HTML entities', async () => {
    const api = createMockApi();
    routeDidGets(api, {
      methods: ['key', 'hedera'],
      dids: { key: [keyDoc], hedera: apiError(`Can't reach "mirror" & retry`) },
    });

    renderList(api);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Could not load hedera DIDs: Can't reach "mirror" & retry`,
    );
  });

  test('a failed method above an otherwise empty list shows both', async () => {
    const api = createMockApi();
    routeDidGets(api, {
      methods: ['key', 'hedera'],
      dids: { key: [], hedera: apiError('Mirror node timeout') },
    });

    renderList(api);

    expect(await screen.findByRole('alert')).toHaveTextContent('hedera');
    expect(screen.getByText('No DIDs yet')).toBeInTheDocument();
  });

  test('shows the empty state when every method returns no DIDs (AC6)', async () => {
    const api = createMockApi();
    routeDidGets(api, { dids: { indy: [], key: [], hedera: [] } });

    renderList(api);

    expect(await screen.findByText('No DIDs yet')).toBeInTheDocument();
    expect(
      screen.getByText('DIDs are created when your wallet is prepared.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test.each([
    ['did:key', KEY_DID, 1],
    ['did:indy', INDY_DID, 0],
    ['did:hedera', HEDERA_DID, 2],
  ])(
    'a %s row links to its encoded details path (AC7)',
    async (_, did, index) => {
      const user = userEvent.setup();
      const api = createMockApi();
      routeDidGets(api);

      renderList(api);

      await screen.findAllByRole('listitem');
      const row = rows()[index];
      expect(row).toHaveAttribute('href', `/dids/${encodeURIComponent(did)}`);

      await user.click(row);

      expect(screen.getByTestId('location')).toHaveTextContent(
        `/dids/${encodeURIComponent(did)}`,
      );
    },
  );

  test('reloads the list every time the page is opened', async () => {
    const api = createMockApi();
    routeDidGets(api);

    const { unmount } = renderList(api);
    await screen.findAllByRole('listitem');
    unmount();
    renderList(api);
    await screen.findAllByRole('listitem');

    expect(
      api.get.mock.calls.filter(([url]) => url === '/dids/methods'),
    ).toHaveLength(2);
  });
});
