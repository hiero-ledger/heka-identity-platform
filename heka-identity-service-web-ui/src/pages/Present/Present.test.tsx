import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import {
  mockWebWalletExtension,
  postFromExtension,
} from '@/shared/lib/webWallet/testUtils';

import Present from './Present';

jest.mock('@/components/QRCode', () => ({
  QRCode: ({ content }: { content: string }) => (
    <div data-testid="qr-code">{content}</div>
  ),
}));

const CLIENT_ID = 'decentralized_identifier:did:key:z6Mk';
const REQUEST_URI = 'https://verifier.example/requests/1';

const query = (params: Record<string, string>) =>
  `/present?${new URLSearchParams(params)}`;

const renderPresent = (route: string) =>
  renderWithProviders(<Present />, { route });

const openWallet = () =>
  screen.findByRole('button', { name: 'Open in Heka Web Wallet' });

const precedes = (element: Element, other: Element) =>
  Boolean(
    element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe('Present', () => {
  afterEach(() => jest.restoreAllMocks());

  test("rebuilds the wallet's request URI from the query and shows it as a QR code", () => {
    const { api } = renderPresent(
      query({
        client_id: CLIENT_ID,
        request_uri: REQUEST_URI,
        request_uri_method: 'post',
        other: 'dropped',
      }),
    );

    expect(screen.getByText('Present a credential')).toBeInTheDocument();
    expect(screen.getByTestId('qr-code')).toHaveTextContent(
      `openid4vp://?${new URLSearchParams({
        client_id: CLIENT_ID,
        request_uri: REQUEST_URI,
        request_uri_method: 'post',
      })}`,
    );
    expect(
      screen.getByRole('button', { name: 'click this link to copy.' }),
    ).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('names the verifier and the host of its request, without vouching for it, before the wallet button', async () => {
    mockWebWalletExtension();
    renderPresent(
      query({
        client_id: CLIENT_ID,
        request_uri: 'https://verifier.example:8443/requests/1',
      }),
    );
    const button = await openWallet();

    const verifier = screen.getByText(CLIENT_ID);
    const host = screen.getByText('verifier.example:8443');
    const note = screen.getByText(
      "Heka only passes this request on to your wallet and doesn't vouch for the verifier.",
    );
    expect(screen.getByText('Verifier (client_id)').nextElementSibling).toBe(
      verifier,
    );
    expect(screen.getByText('Request hosted at').nextElementSibling).toBe(host);
    for (const element of [verifier, host, note]) {
      expect(precedes(element, screen.getByTestId('qr-code'))).toBe(true);
      expect(precedes(element, button)).toBe(true);
    }
  });

  test('shows an internationalized request host in punycode', () => {
    renderPresent(
      query({ client_id: CLIENT_ID, request_uri: 'https://exämple.com/r' }),
    );

    expect(screen.getByText('xn--exmple-cua.com')).toBeInTheDocument();
  });

  test('hands the request to the Heka Web Wallet and shows its answer', async () => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    const { sent } = mockWebWalletExtension();
    renderPresent(query({ client_id: CLIENT_ID, request_uri: REQUEST_URI }));
    const requestUri = `openid4vp://?${new URLSearchParams({
      client_id: CLIENT_ID,
      request_uri: REQUEST_URI,
    })}`;

    await user.click(await openWallet());

    expect(sent).toEqual([
      {
        source: 'heka-web-wallet-bridge',
        type: 'PRESENT_REQUEST',
        payload: { requestUri },
      },
    ]);

    act(() => {
      postFromExtension('PRESENT_STATUS', {
        requestUri,
        state: 'error',
        message: 'No matching credential',
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No matching credential',
    );
    expect(error).not.toHaveBeenCalled();

    act(() => {
      postFromExtension('PRESENT_STATUS', {
        requestUri,
        state: 'done',
        message: '',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your wallet has answered the verifier.',
    );
  });

  test("shows the wallet's refusal of the request on the page", async () => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    mockWebWalletExtension({
      response: {
        type: 'ERROR',
        message: 'This site is not connected to the wallet.',
      },
    });
    renderPresent(query({ client_id: CLIENT_ID, request_uri: REQUEST_URI }));

    await user.click(await openWallet());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This site is not connected to the wallet.',
    );
    expect(error).not.toHaveBeenCalled();
  });

  test.each([
    [
      'without a client_id',
      { request_uri: REQUEST_URI },
      'The link must name the verifier (client_id) and the address of its request (request_uri).',
    ],
    [
      'without a request_uri',
      { client_id: CLIENT_ID },
      'The link must name the verifier (client_id) and the address of its request (request_uri).',
    ],
    [
      'with an http request_uri',
      { client_id: CLIENT_ID, request_uri: 'http://verifier.example/r' },
      'The request must be fetched from an https address.',
    ],
    [
      'with a request_uri that is no URL',
      { client_id: CLIENT_ID, request_uri: 'verifier.example/r' },
      'The request must be fetched from an https address.',
    ],
    [
      'with another request_uri_method',
      {
        client_id: CLIENT_ID,
        request_uri: REQUEST_URI,
        request_uri_method: 'put',
      },
      'request_uri_method must be get or post.',
    ],
  ])('explains a link %s', (_, params, message) => {
    const postMessage = jest.spyOn(window, 'postMessage');
    renderPresent(query(params));

    expect(
      screen.getByText('This presentation link is not valid'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });

  describe('an http request_uri on this machine', () => {
    const params = {
      client_id: CLIENT_ID,
      request_uri: 'http://localhost:3000/oid4vp/requests/1',
    };
    const isDev = __IS_DEV__;
    const setDev = (value: boolean) =>
      Object.assign(globalThis, { __IS_DEV__: value });

    afterEach(() => setDev(isDev));

    test('is accepted in development', () => {
      setDev(true);
      renderPresent(query(params));

      expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    });

    test('is refused in production', () => {
      setDev(false);
      renderPresent(query(params));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The request must be fetched from an https address.',
      );
    });
  });
});
