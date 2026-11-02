import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';
import { ConnectionRecord } from '@/entities/Connection';
import { ConnectionState } from '@/entities/Connection/model/types/connection';

// The real Button and Select pull in SVG icons that jest cannot load
jest.mock('@/shared/ui/Button', () => ({
  Button: ({
    children,
    isDisabled,
    onPress,
  }: {
    children: React.ReactNode;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      disabled={isDisabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
jest.mock('@/shared/ui/Select', () => ({
  Select: ({
    items,
    placeholder,
    onSelect,
  }: {
    items: Array<{ value: string; content: string }>;
    placeholder: string;
    onSelect: (value: string) => void;
  }) => (
    <select
      aria-label={placeholder}
      defaultValue=""
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {items.map((item) => (
        <option
          key={item.value}
          value={item.value}
        >
          {item.content}
        </option>
      ))}
    </select>
  ),
}));

import { ExistingConnectionSelect } from './ExistingConnectionSelect';

const connections: ConnectionRecord[] = [
  {
    id: 'conn-1-aaaaaaaa',
    state: ConnectionState.Completed,
    role: 'responder',
    createdAt: '2026-10-02T10:00:00Z',
    alias: 'Alice Smith',
  },
  {
    id: 'conn-2-bbbbbbbb',
    state: ConnectionState.Completed,
    role: 'responder',
    createdAt: '2026-10-01T10:00:00Z',
    theirLabel: 'didcomm-oob-invitation',
  },
];

describe('ExistingConnectionSelect', () => {
  test('renders nothing without connections', () => {
    const { container } = render(
      <ExistingConnectionSelect
        connections={[]}
        onSelect={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('lists connections by name and sends the chosen id', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();

    render(
      <ExistingConnectionSelect
        connections={connections}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText(/^Alice Smith · /)).toBeInTheDocument();
    expect(
      screen.getByText(/^Unnamed connection \(conn-2-b\) · /),
    ).toBeInTheDocument();
    expect(screen.queryByText(/didcomm-oob-invitation/)).toBeNull();

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText('Select connection'),
      'conn-1-aaaaaaaa',
    );
    await user.click(send);

    expect(onSelect).toHaveBeenCalledWith('conn-1-aaaaaaaa');
  });
});
