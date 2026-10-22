import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';
import { setViewportWidth } from '@/components/testUtils/viewport';

import { ButtonCards } from './ButtonCards';

const options = [
  { value: 'a', content: 'Alpha' },
  { value: 'b', content: 'Beta' },
  { value: 'c', content: 'Gamma' },
  { value: 'd', content: 'Delta' },
];

// The radio circle of the selected card holds an inner dot
const hasDot = (card: HTMLElement) =>
  (card.firstChild as HTMLElement).childElementCount === 1;

describe('ButtonCards', () => {
  afterEach(() => setViewportWidth(1024));

  test('renders options, marks the selected one and reports clicks', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ButtonCards
        options={options}
        selected="b"
        onChange={onChange}
        limitWidth
      />,
    );

    expect(hasDot(screen.getByTitle('Beta'))).toBe(true);
    expect(hasDot(screen.getByTitle('Alpha'))).toBe(false);

    await user.click(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  test('is a radio group operable from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(
      <ButtonCards
        label="Network"
        options={options}
        selected="b"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Network' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Alpha' })).not.toBeChecked();

    screen.getByRole('radio', { name: 'Gamma' }).focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('c');

    screen.getByRole('radio', { name: 'Delta' }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('d');
  });

  test('the create card is a labelled button', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();

    render(
      <ButtonCards
        options={options.slice(0, 1)}
        onChange={jest.fn()}
        onCreate={onCreate}
      />,
    );

    screen.getByRole('button', { name: 'Create' }).focus();
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalled();
  });

  test('renders a create card when onCreate is given', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();

    const { container } = render(
      <ButtonCards
        options={options.slice(0, 1)}
        onChange={jest.fn()}
        onCreate={onCreate}
        direction="column"
      />,
    );

    const group = container.firstChild as HTMLElement;
    expect(group.childElementCount).toBe(2);
    await user.click(group.lastChild as HTMLElement);
    expect(onCreate).toHaveBeenCalled();
  });

  test('renders on mobile without a create card', () => {
    setViewportWidth(400);

    const { container } = render(
      <ButtonCards
        options={options}
        onChange={jest.fn()}
      />,
    );

    expect((container.firstChild as HTMLElement).childElementCount).toBe(4);
  });
});
