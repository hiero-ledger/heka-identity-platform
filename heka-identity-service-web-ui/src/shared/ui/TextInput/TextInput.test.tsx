import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/shared/assets/icons/visibility-off.svg', () => 'visibility-off.svg');
jest.mock('@/shared/assets/icons/visibility-outline.svg', () => 'visibility-outline.svg');

import { TextInputUncontrolled } from './TextInput';

describe('TextInputUncontrolled', () => {
  test('invokes onChange on typed input', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <TextInputUncontrolled
        label="Search"
        onChange={onChange}
      />,
    );

    await user.type(screen.getByPlaceholderText('Search'), 'abc');

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith('abc');
  });

  test('propagates empty value when user clears input', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <TextInputUncontrolled
        label="Search"
        initValue="abc"
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText('Search');
    await user.clear(input);

    expect((input as HTMLInputElement).value).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
