import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

// The real Button pulls in SVG icons that jest cannot load
jest.mock('@/shared/ui/Button', () => ({
  Button: ({
    children,
    isDisabled,
    type,
  }: {
    children: React.ReactNode;
    isDisabled?: boolean;
    type?: 'submit' | 'button';
  }) => (
    <button
      type={type}
      disabled={isDisabled}
    >
      {children}
    </button>
  ),
}));

import { ConnectionNameInput } from './ConnectionNameInput';

const getInput = () => screen.getByRole('textbox');

describe('ConnectionNameInput', () => {
  test('applies the trimmed name on button click', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();

    render(
      <ConnectionNameInput
        value=""
        onApply={onApply}
      />,
    );

    await user.type(getInput(), '  Alice Smith ');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith('Alice Smith');
  });

  test('applies on Enter', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();

    render(
      <ConnectionNameInput
        value=""
        onApply={onApply}
      />,
    );

    await user.type(getInput(), 'Front desk{Enter}');

    expect(onApply).toHaveBeenCalledWith('Front desk');
  });

  test('keeps Apply disabled until the name changes', () => {
    render(
      <ConnectionNameInput
        value="Alice"
        onApply={jest.fn()}
      />,
    );

    expect(getInput()).toHaveValue('Alice');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onApply = jest.fn();

    render(
      <ConnectionNameInput
        value=""
        isDisabled
        onApply={onApply}
      />,
    );

    expect(getInput()).toBeDisabled();
    await user.type(getInput(), 'Alice{Enter}');

    expect(onApply).not.toHaveBeenCalled();
  });
});
