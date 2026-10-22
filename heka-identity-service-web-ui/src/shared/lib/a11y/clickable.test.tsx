import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ClickableOptions, clickableProps } from './clickable';

const renderClickable = (options?: ClickableOptions) => {
  const onActivate = jest.fn();
  render(<div {...clickableProps(onActivate, options)}>Item</div>);
  return onActivate;
};

describe('clickableProps', () => {
  test('makes a button that activates on click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onActivate = renderClickable({ label: 'Open item' });

    const button = screen.getByRole('button', { name: 'Open item' });
    expect(button).toHaveAttribute('tabindex', '0');

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.keyboard('a');

    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  test('a link activates on Enter only', async () => {
    const user = userEvent.setup();
    const onActivate = renderClickable({ role: 'link' });

    screen.getByRole('link', { name: 'Item' }).focus();
    await user.keyboard(' ');
    expect(onActivate).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  test('a radio reports whether it is checked', () => {
    renderClickable({ role: 'radio', checked: true });

    expect(screen.getByRole('radio', { name: 'Item' })).toBeChecked();
  });

  test('a disabled element leaves the tab order and ignores activation', async () => {
    const user = userEvent.setup();
    const onActivate = renderClickable({ disabled: true });

    const button = screen.getByRole('button', { name: 'Item' });
    expect(button).toHaveAttribute('tabindex', '-1');
    expect(button).toHaveAttribute('aria-disabled', 'true');

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');

    expect(onActivate).not.toHaveBeenCalled();
  });
});
