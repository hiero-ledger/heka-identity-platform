import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import {
  announceExtension,
  mockWebWalletExtension,
  postFromExtension,
} from '@/shared/lib/webWallet/testUtils';

import { WebWalletButton } from './WebWalletButton';

const OFFER = 'openid-credential-offer://?credential_offer_uri=x';
const OTHER_OFFER = 'openid-credential-offer://?credential_offer_uri=y';
const NO_ANSWER = 'No answer from the Heka Web Wallet; reload the page.';
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

  describe('waiting for the answer to a send', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const pressOpen = async () => {
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });
      await user.click(await openWallet());
    };

    test('asks for a reload when the wallet stays silent for 5 s', async () => {
      const error = jest.spyOn(toast, 'error');
      const { sent } = mockWebWalletExtension({ answerSends: false });
      renderWithProviders(<WebWalletButton uri={OFFER} />);

      await pressOpen();
      expect(sent).toEqual([
        expect.objectContaining({ type: 'RECEIVE_OFFER' }),
      ]);
      await act(() => jest.advanceTimersByTimeAsync(4000));
      expect(error).not.toHaveBeenCalled();
      await act(() => jest.advanceTimersByTimeAsync(1000));

      expect(error).toHaveBeenCalledWith(NO_ANSWER);
      expect(error).toHaveBeenCalledTimes(1);
    });

    test('passes the silence to onStatus where given', async () => {
      const error = jest.spyOn(toast, 'error');
      const onStatus = jest.fn();
      mockWebWalletExtension({ answerSends: false });
      renderWithProviders(
        <WebWalletButton
          uri={REQUEST}
          onStatus={onStatus}
        />,
      );

      await pressOpen();
      await act(() => jest.advanceTimersByTimeAsync(5000));

      expect(onStatus).toHaveBeenCalledWith({
        state: 'error',
        message: NO_ANSWER,
      });
      expect(error).not.toHaveBeenCalled();
    });

    test('an answer in time leaves nothing to show', async () => {
      const error = jest.spyOn(toast, 'error');
      mockWebWalletExtension();
      renderWithProviders(<WebWalletButton uri={OFFER} />);

      await pressOpen();
      await act(() => jest.advanceTimersByTimeAsync(10_000));

      expect(error).not.toHaveBeenCalled();
    });

    test("after the URI changes, ignores the earlier item's answer, statuses and silence", async () => {
      const error = jest.spyOn(toast, 'error');
      mockWebWalletExtension({ answerSends: false });
      const { rerender } = render(<WebWalletButton uri={OFFER} />);

      await pressOpen();
      rerender(<WebWalletButton uri={OTHER_OFFER} />);
      act(() => {
        postFromExtension('RECEIVE_OFFER_RESPONSE', {
          type: 'ERROR',
          message: 'This site is not connected to the wallet.',
        });
        postFromExtension('RECEIVE_STATUS', {
          offerUri: OFFER,
          state: 'error',
          message: 'The offer has expired.',
        });
      });
      await act(() => jest.advanceTimersByTimeAsync(10_000));

      expect(error).not.toHaveBeenCalled();
      expect(await openWallet()).toBeInTheDocument();
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
