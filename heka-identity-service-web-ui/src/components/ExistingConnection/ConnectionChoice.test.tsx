import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';
import { ConnectionRecord } from '@/entities/Connection';
import { ConnectionState } from '@/entities/Connection/model/types/connection';

import { ConnectionChoice, ConnectionChoiceOptions } from './ConnectionChoice';

const connections: ConnectionRecord[] = [
  {
    id: 'conn-1-aaaaaaaa',
    state: ConnectionState.Completed,
    role: 'responder',
    createdAt: '2026-10-02T10:00:00Z',
    alias: 'Alice Smith',
  },
];

const renderChoice = (
  overrides: Partial<ConnectionChoiceOptions & { qrValue?: string }> = {},
) => {
  const props = {
    connections,
    isExistingConnectionSelected: false,
    connectionAlias: 'Office',
    canRename: true,
    renameInvitation: jest.fn(),
    selectConnection: jest.fn(),
    onUseQr: jest.fn(),
    qrValue: 'didcomm://invite',
    ...overrides,
  };
  const result = render(
    <ConnectionChoice
      waitingText="Waiting for the holder"
      {...props}
    />,
  );
  return { ...result, props };
};

describe('ConnectionChoice', () => {
  test('shows the QR code, the name input and existing connections', async () => {
    const user = userEvent.setup();
    const { container, props } = renderChoice();

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Connection name (optional)'),
    ).toHaveValue('Office');
    expect(
      screen.getByText('Send to an existing connection'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Select connection/ }));
    await user.click(screen.getByRole('option', { name: /^Alice Smith/ }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(props.selectConnection).toHaveBeenCalledWith('conn-1-aaaaaaaa');
  });

  test('renames the invitation', async () => {
    const user = userEvent.setup();
    const { props } = renderChoice();

    const input = screen.getByPlaceholderText('Connection name (optional)');
    await user.clear(input);
    await user.type(input, ' Branch ');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(props.renameInvitation).toHaveBeenCalledWith('Branch');
  });

  test('shows a loader until the QR code is ready and blocks renaming', () => {
    const { container } = renderChoice({
      qrValue: undefined,
      canRename: false,
      connections: [],
    });

    expect(container.querySelector('svg')).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Connection name (optional)'),
    ).toBeDisabled();
    expect(
      screen.queryByText('Send to an existing connection'),
    ).not.toBeInTheDocument();
  });

  test('waits for the holder after choosing an existing connection', async () => {
    const user = userEvent.setup();
    const { props } = renderChoice({ isExistingConnectionSelected: true });

    expect(screen.getByText('Waiting for the holder')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Connection name (optional)'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Use QR code instead' }),
    );
    expect(props.onUseQr).toHaveBeenCalled();
  });
});
