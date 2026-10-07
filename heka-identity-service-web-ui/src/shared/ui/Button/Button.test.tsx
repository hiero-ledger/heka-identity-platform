import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './Button';

describe('Button', () => {
  test('renders children and calls onPress when clicked', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <Button
        onPress={onPress}
        leftIcon="add"
        rightIcon="forward"
        buttonType="outlined"
        isSmall
        fullWidth
        alignment="left"
        className="custom"
      >
        Press me
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Press me' });
    expect(button).toHaveClass('custom');

    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('is disabled and does not fire onPress when isDisabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <Button
        isDisabled
        onPress={onPress}
      >
        Disabled
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('is disabled while loading and hides icons', () => {
    const { container } = render(
      <Button
        isLoading
        leftIcon="edit"
        rightIcon="delete"
      >
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    // Only the loader is rendered next to the text, no icons
    expect(container.querySelectorAll('button > div')).toHaveLength(1);
  });

  test.each([
    'add',
    'arrow-back',
    'forward',
    'logout',
    'user',
    'close',
    'close-black',
    'delete',
    'dots',
    'edit',
    'register',
  ] as const)('renders the %s icon', (icon) => {
    const { container } = render(
      <Button
        leftIcon={icon}
        aria-label={icon}
      />,
    );

    expect(screen.getByRole('button', { name: icon })).toBeInTheDocument();
    expect(container.querySelectorAll('button > div')).toHaveLength(1);
  });
});
