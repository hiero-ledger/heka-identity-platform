import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import {
  announceExtension,
  mockWebWalletExtension,
} from '@/shared/lib/webWallet/testUtils';

import { WebWalletButton } from './WebWalletButton';

const OFFER = 'openid-credential-offer://?credential_offer_uri=x';
const REQUEST =
  'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fr';

const openWallet = () =>
  screen.findByRole('button', { name: 'Open in Heka Web Wallet' });

describe('WebWalletButton', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('without an answer to its PING', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('appears when the bridge announces itself after detection gave up', async () => {
      mockWebWalletExtension({ answerPing: false });
      renderWithProviders(<WebWalletButton uri={OFFER} />);

      await act(() => jest.advanceTimersByTimeAsync(5000));
      expect(
        screen.queryByRole('button', { name: 'Open in Heka Web Wallet' }),
      ).not.toBeInTheDocument();

      act(() => {
        announceExtension();
      });

      expect(
        screen.getByRole('button', { name: 'Open in Heka Web Wallet' }),
      ).toBeInTheDocument();
    });
  });

  test.each([
    ['an offer', OFFER, 'RECEIVE_OFFER'],
    ['a request', REQUEST, 'PRESENT_REQUEST'],
  ])("shows the wallet's refusal of %s as a toast", async (_, uri, type) => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    const { sent } = mockWebWalletExtension({
      response: {
        type: 'ERROR',
        message: 'This site is not connected to the wallet.',
      },
    });
    renderWithProviders(<WebWalletButton uri={uri} />);

    await user.click(await openWallet());

    expect(sent).toEqual([expect.objectContaining({ type })]);
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'This site is not connected to the wallet.',
      ),
    );
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('shows nothing when the wallet acknowledges the item', async () => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    const onStatus = jest.fn();
    mockWebWalletExtension();
    renderWithProviders(
      <WebWalletButton
        uri={OFFER}
        onStatus={onStatus}
      />,
    );

    await user.click(await openWallet());
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(error).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });
});
