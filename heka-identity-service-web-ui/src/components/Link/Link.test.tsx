import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import '@/translations';

import { CopyLink } from './CopyLink';
import { Link } from './Link';

describe('Link', () => {
  test('renders text and calls onClick', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(
      <Link
        text="Open"
        onClick={onClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('CopyLink', () => {
  afterEach(() => jest.restoreAllMocks());

  test('copies the value to the clipboard and notifies', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');

    render(<CopyLink value="https://example.com/offer" />);

    await user.click(
      screen.getByRole('button', { name: 'click this link to copy.' }),
    );

    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://example.com/offer',
    );
    expect(success).toHaveBeenCalledWith('Copied');
  });

  test('does not notify when there is nothing to copy', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');

    render(<CopyLink />);

    await user.click(
      screen.getByRole('button', { name: 'click this link to copy.' }),
    );

    expect(writeText).toHaveBeenCalledWith('');
    expect(success).not.toHaveBeenCalled();
  });
});
