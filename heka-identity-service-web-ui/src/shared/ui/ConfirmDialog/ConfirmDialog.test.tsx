import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import '@/translations';
import { Modal } from '@/shared/ui/Modal/Modal';

import useConfirmDialog, { ConfirmForm } from './index';

describe('Modal', () => {
  const Harness = () => {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <>
        <span>{isOpen ? 'open' : 'closed'}</span>
        <Modal
          title="My modal"
          isOpen={isOpen}
          handleToggle={setIsOpen}
        >
          <p>Modal body</p>
        </Modal>
      </>
    );
  };

  test('renders title and content, and closes with the close button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(
      screen.getByRole('heading', { name: 'My modal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();

    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );

    await waitFor(() =>
      expect(screen.queryByText('Modal body')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  test('closes with the outer shutter button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[0],
    );

    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());
  });

  test('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());
  });
});

describe('ConfirmForm', () => {
  test('uses default texts', () => {
    render(
      <ConfirmForm
        isOpen
        handleToggle={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Do you confirm the action?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
  });

  test('uses custom texts and callbacks', async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn().mockResolvedValue(undefined);
    const onCancel = jest.fn().mockResolvedValue(undefined);

    render(
      <ConfirmForm
        isOpen
        handleToggle={jest.fn()}
        text="Delete item?"
        details="This cannot be undone"
        cancelButtonText="Keep"
        acceptButtonText="Delete"
        onAccept={onAccept}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('This cannot be undone')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onAccept).toHaveBeenCalled();
  });
});

describe('useConfirmDialog', () => {
  const Harness = ({
    onAccept,
    onCancel,
  }: {
    onAccept?: () => Promise<void>;
    onCancel?: () => Promise<void>;
  }) => {
    const { dialogProps, confirm } = useConfirmDialog({
      text: 'Remove template?',
      // Inline callbacks change identity on every render, as real callers' often do
      onAccept: onAccept && (() => onAccept()),
      onCancel: onCancel && (() => onCancel()),
    });
    return (
      <>
        <button onClick={confirm}>remove</button>
        <ConfirmForm {...dialogProps} />
      </>
    );
  };

  test('keeps the open dialog mounted when the caller re-renders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness onAccept={jest.fn().mockResolvedValue(undefined)} />,
    );

    await user.click(screen.getByRole('button', { name: 'remove' }));
    const heading = await screen.findByRole('heading', {
      name: 'Remove template?',
    });

    // The caller re-renders with new callbacks while the dialog is open
    rerender(<Harness onAccept={jest.fn().mockResolvedValue(undefined)} />);

    // The same DOM node: the dialog was updated in place, not unmounted and mounted again
    expect(screen.getByRole('heading', { name: 'Remove template?' })).toBe(
      heading,
    );
  });

  test('closing with Escape cancels once, and opening does not cancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn().mockResolvedValue(undefined);
    render(<Harness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'remove' }));
    await screen.findByRole('heading', { name: 'Remove template?' });
    expect(onCancel).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('opens on confirm and runs onAccept', async () => {
    const user = userEvent.setup();
    const onAccept = jest.fn().mockResolvedValue(undefined);

    render(<Harness onAccept={onAccept} />);
    expect(screen.queryByText('Remove template?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'remove' }));
    expect(
      await screen.findByRole('heading', { name: 'Remove template?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(onAccept).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );
  });

  test('runs onCancel when cancelled', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn().mockResolvedValue(undefined);

    render(<Harness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'remove' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );
  });

  test('runs onCancel when closed with the close button', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn().mockResolvedValue(undefined);

    render(<Harness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'remove' }));
    await user.click(
      (await screen.findAllByRole('button', { name: 'close button' }))[1],
    );

    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );
  });

  test('closes without callbacks', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'remove' }));
    await user.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'remove' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByText('Remove template?')).not.toBeInTheDocument(),
    );
  });
});
