import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TextArea } from './TextArea';

describe('TextArea', () => {
  test('shows the initial value and reports typed text', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <TextArea
        label="Notes"
        initValue="Hello"
        onChange={onChange}
      />,
    );

    const textArea = screen.getByPlaceholderText('Notes');
    expect(textArea).toHaveValue('Hello');
    expect(textArea).toHaveAttribute('title', 'Notes');

    await user.type(textArea, '!');

    expect(onChange).toHaveBeenLastCalledWith('Hello!');
    expect(textArea).toHaveValue('Hello!');
  });

  test('can be cleared, and reports the empty value', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <TextArea
        label="Notes"
        initValue="Hi"
        onChange={onChange}
      />,
    );

    const textArea = screen.getByPlaceholderText('Notes');
    await user.clear(textArea);

    expect(textArea).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  test('starts empty and controlled without an initial value', async () => {
    const user = userEvent.setup();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(<TextArea label="Notes" />);
    const textArea = screen.getByPlaceholderText('Notes');
    expect(textArea).toHaveValue('');

    await user.type(textArea, 'a');

    expect(textArea).toHaveValue('a');
    // No "changing an uncontrolled input to be controlled" warning
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('follows initValue updates', () => {
    const { rerender } = render(
      <TextArea
        label="Notes"
        initValue="first"
      />,
    );

    rerender(
      <TextArea
        label="Notes"
        initValue="second"
      />,
    );

    expect(screen.getByPlaceholderText('Notes')).toHaveValue('second');
  });

  test('can be disabled', () => {
    render(
      <TextArea
        label="Notes"
        disabled
      />,
    );

    expect(screen.getByPlaceholderText('Notes')).toBeDisabled();
  });
});
