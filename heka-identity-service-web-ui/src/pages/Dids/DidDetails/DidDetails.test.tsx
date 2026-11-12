import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import ROUTES, { didDetailsPath } from '@/app/routes/RoutePaths';
import { DidDocument } from '@/entities/Did';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import Dids from '../Dids';
import {
  apiError,
  HEDERA_DID,
  hederaDoc,
  INDY_DID,
  indyDoc,
  KEY_DID,
  keyDoc,
  routeDidGets,
} from '../testUtils';
import DidDetails from './DidDetails';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const loadedState = (items: DidDocument[]): Partial<StateSchema> => ({
  dids: { isLoading: false, items, failedMethods: [] },
});

const renderDetails = (
  did: string,
  {
    api = createMockApi(),
    initialState,
  }: {
    api?: ReturnType<typeof createMockApi>;
    initialState?: Partial<StateSchema>;
  } = {},
) =>
  renderWithProviders(
    <Routes>
      <Route
        path={ROUTES.DIDS}
        element={<LocationDisplay />}
      />
      <Route
        path={ROUTES.DID_DETAILS}
        element={<DidDetails />}
      />
    </Routes>,
    { api, initialState, route: didDetailsPath(did) },
  );

/** The `<dd>` values of a `<dt>` label within `container`. */
const valuesOf = (container: HTMLElement, label: string) => {
  const term = within(container)
    .getAllByRole('term')
    .find((dt) => dt.textContent === label);
  if (!term) throw new Error(`No "${label}" in the container`);
  const values: string[] = [];
  let sibling = term.nextElementSibling;
  while (sibling && sibling.tagName === 'DD') {
    values.push(sibling.textContent ?? '');
    sibling = sibling.nextElementSibling;
  }
  return values;
};

const section = (name: string) => screen.getByRole('region', { name });

const mockClipboard = () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
};

describe('DidDetails', () => {
  test('a deep link loads the list and shows the DID (AC8)', async () => {
    const api = createMockApi();
    routeDidGets(api);

    renderDetails(HEDERA_DID, { api });

    expect(
      await screen.findByRole('region', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('did-value')).toHaveTextContent(HEDERA_DID);
    expect(api.get).toHaveBeenCalledWith('/dids/methods');
    // Only the list is used: the DID is never resolved on its own
    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/dids\/did/),
      expect.anything(),
    );
  });

  test('a DID that is not in the list is reported with a link back (AC8)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    routeDidGets(api);

    renderDetails('did:key:z6MkUnknown', { api });

    expect(
      await screen.findByText('This DID is not in your wallet'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dids$/);
  });

  test('a DID whose method failed shows that method\'s load error, not "not found" (AC5a)', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    routeDidGets(api, {
      dids: {
        indy: [indyDoc],
        key: [keyDoc],
        hedera: apiError('Mirror node timeout'),
      },
    });

    renderDetails(HEDERA_DID, { api });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Could not load hedera DIDs: Mirror node timeout',
    );
    expect(
      screen.queryByText('This DID is not in your wallet'),
    ).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();

    routeDidGets(api);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('region', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the load error with Retry when the whole list fails', async () => {
    const api = createMockApi();
    routeDidGets(api, { methods: apiError('Service unavailable', 503) });

    renderDetails(KEY_DID, { api });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Service unavailable');
    expect(
      within(alert).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument();
    // The error is not retried in a loop
    expect(
      api.get.mock.calls.filter(([url]) => url === '/dids/methods'),
    ).toHaveLength(1);
  });

  test('shows a loader while the list loads', async () => {
    const api = createMockApi();
    api.get.mockReturnValue(new Promise(() => {}));

    renderDetails(KEY_DID, { api });

    expect(
      await screen.findByRole('status', { name: 'Loading DIDs' }),
    ).toBeInTheDocument();
  });

  test('uses the loaded list without requesting it again', () => {
    const api = createMockApi();

    renderDetails(KEY_DID, { api, initialState: loadedState([keyDoc]) });

    expect(screen.getByTestId('did-value')).toHaveTextContent(KEY_DID);
    expect(api.get).not.toHaveBeenCalled();
  });

  test('renders the whole document (AC9)', () => {
    renderDetails(HEDERA_DID, { initialState: loadedState([hederaDoc]) });

    const overview = section('Overview');
    expect(valuesOf(overview, 'Method')).toEqual(['hedera']);
    expect(valuesOf(overview, 'Context')).toEqual([
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ]);
    expect(valuesOf(overview, 'Controller')).toEqual([HEDERA_DID]);
    expect(valuesOf(overview, 'Also known as')).toEqual([
      'https://issuer.example.com',
    ]);

    const [rootKey, jwkKey] = within(
      section('Verification methods'),
    ).getAllByRole('listitem');
    expect(valuesOf(rootKey, 'ID')).toEqual([`${HEDERA_DID}#did-root-key`]);
    expect(valuesOf(rootKey, 'Type')).toEqual(['Ed25519VerificationKey2020']);
    expect(valuesOf(rootKey, 'Controller')).toEqual([HEDERA_DID]);
    expect(valuesOf(rootKey, 'publicKeyMultibase')[0]).toContain(
      'z6MkgUv5CvjRP6AsvEYqSRN7djB6p4zK9bcMQ93g5yK6Td7N',
    );
    expect(valuesOf(jwkKey, 'publicKeyJwk')[0]).toContain(
      JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'jwk-x-value' }),
    );

    const relationships = section('Verification relationships');
    expect(valuesOf(relationships, 'Authentication')).toEqual([
      `${HEDERA_DID}#did-root-key`,
    ]);
    expect(valuesOf(relationships, 'Assertion method')).toEqual([
      `${HEDERA_DID}#did-root-key`,
    ]);
    // An embedded verification method is shown with its own fields
    const [embedded] = valuesOf(relationships, 'Key agreement');
    expect(embedded).toContain(`${HEDERA_DID}#key-agreement-1`);
    expect(embedded).toContain('X25519KeyAgreementKey2019');
    expect(embedded).toContain('JhNWeSVLMYccCk7iopQW4guaSJTojqpMEELgSLhKwRr');
    expect(
      within(relationships).queryByText('Capability invocation'),
    ).not.toBeInTheDocument();

    const [didcomm, v2] = within(section('Services')).getAllByRole('listitem');
    expect(valuesOf(didcomm, 'ID')).toEqual([
      `${HEDERA_DID}#did-communication`,
    ]);
    expect(valuesOf(didcomm, 'Type')).toEqual(['did-communication']);
    expect(valuesOf(didcomm, 'Service endpoint')).toEqual([
      'javascript:alert(1)',
    ]);
    expect(valuesOf(didcomm, 'recipientKeys')).toEqual([
      JSON.stringify([`${HEDERA_DID}#key-agreement-1`], null, 2),
    ]);
    expect(valuesOf(didcomm, 'routingKeys')).toEqual([
      JSON.stringify(['did:key:z6MkRouting'], null, 2),
    ]);
    expect(valuesOf(didcomm, 'accept')).toEqual([
      JSON.stringify(['didcomm/aip2;env=rfc19'], null, 2),
    ]);
    expect(valuesOf(didcomm, 'priority')).toEqual(['0']);
    expect(valuesOf(v2, 'Service endpoint')).toEqual([
      JSON.stringify(
        { uri: 'https://mediator.example.com', accept: [] },
        null,
        2,
      ),
    ]);
  });

  test('hides the rows and sections a document does not have', () => {
    const minimal: DidDocument = { id: KEY_DID };

    renderDetails(KEY_DID, { initialState: loadedState([minimal]) });

    const overview = section('Overview');
    expect(valuesOf(overview, 'Method')).toEqual(['key']);
    expect(within(overview).queryByText('Context')).not.toBeInTheDocument();
    expect(
      within(overview).queryByText('Also known as'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  test('shows the contexts of a document that carried `context` (AC9)', async () => {
    const api = createMockApi();
    routeDidGets(api, {
      methods: ['key'],
      dids: {
        key: [
          {
            context: ['https://w3id.org/did/v1'],
            id: KEY_DID,
          } as unknown as DidDocument,
        ],
      },
    });

    renderDetails(KEY_DID, { api });

    const overview = await screen.findByRole('region', { name: 'Overview' });
    expect(valuesOf(overview, 'Context')).toEqual(['https://w3id.org/did/v1']);
  });

  test('has a collapsed raw JSON view of the stored document (AC10)', async () => {
    const user = userEvent.setup();

    renderDetails(HEDERA_DID, { initialState: loadedState([hederaDoc]) });

    const summary = screen.getByText('Raw JSON');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);

    expect(details).toHaveAttribute('open');
    const raw = screen.getByTestId('did-raw-json');
    expect(raw.textContent).toBe(JSON.stringify(hederaDoc, null, 2));
    expect(raw).toHaveTextContent('"foo": "bar"');
  });

  test('copies the DID and the raw JSON with a success toast (AC11)', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();

    renderDetails(HEDERA_DID, { initialState: loadedState([hederaDoc]) });

    await user.click(screen.getByRole('button', { name: 'Copy DID' }));
    expect(writeText).toHaveBeenLastCalledWith(HEDERA_DID);
    expect(toast.success).toHaveBeenLastCalledWith('Copied');

    await user.click(screen.getByText('Raw JSON'));
    await user.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(writeText).toHaveBeenLastCalledWith(
      JSON.stringify(hederaDoc, null, 2),
    );
    expect(toast.success).toHaveBeenCalledTimes(2);

    // Keys are copied from the raw JSON: they have no button of their own
    expect(
      screen.queryByRole('button', { name: 'Copy public key' }),
    ).not.toBeInTheDocument();
  });

  test('reports a failed copy', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard();
    writeText.mockRejectedValue(new Error('Denied'));

    renderDetails(KEY_DID, { initialState: loadedState([keyDoc]) });

    await user.click(screen.getByRole('button', { name: 'Copy DID' }));

    expect(toast.error).toHaveBeenCalledWith('Could not copy to the clipboard');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('renders a javascript: service endpoint as plain text (AC12)', () => {
    const { container } = renderDetails(HEDERA_DID, {
      initialState: loadedState([hederaDoc]),
    });

    const endpoint = screen.getByText('javascript:alert(1)');
    expect(endpoint.closest('a')).toBeNull();
    // Nothing in the document becomes a link (the way back to the list is a button)
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  test.each([KEY_DID, INDY_DID, HEDERA_DID])(
    'a row of the list opens the details of %s (AC7)',
    async (did) => {
      const user = userEvent.setup();
      const api = createMockApi();
      routeDidGets(api);

      renderWithProviders(
        <Routes>
          <Route
            path={ROUTES.DIDS}
            element={<Dids />}
          />
          <Route
            path={ROUTES.DID_DETAILS}
            element={<DidDetails />}
          />
        </Routes>,
        { api, route: ROUTES.DIDS },
      );

      const row = (await screen.findAllByRole('link')).find((link) =>
        link.textContent?.includes(did),
      )!;
      await user.click(row);

      expect(screen.getByTestId('did-value')).toHaveTextContent(did);
      expect(valuesOf(section('Overview'), 'Method')).toEqual([
        did.split(':')[1],
      ]);
    },
  );
});
