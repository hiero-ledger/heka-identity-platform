import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  test('renders the translated label and calls onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <ActionButton
        labelKey="SignIn.buttons.signOut"
        leftIcon="logout"
        onPress={onPress}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onPress).toHaveBeenCalled();
  });

  test('does not call onPress when disabled', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <ActionButton
        labelKey="Profile.buttons.changePassword"
        isDisabled
        isSmall
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: 'Change password' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
