import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldValues, useForm } from 'react-hook-form';

import { FormSelect } from '../FormSelect';
import { Select } from './Select';

const items = [
  { value: 'one', content: 'Option one' },
  { value: 'two', content: 'Option two' },
  { value: 'three', content: 'Option three', isDisabled: true },
];

describe('Select', () => {
  test('shows the default placeholder when nothing is selected', () => {
    render(
      <Select
        aria-label="Values"
        items={items}
      />,
    );

    expect(screen.getByText('Select value')).toBeInTheDocument();
  });

  test('stays controlled from an empty start, without React warnings', async () => {
    const user = userEvent.setup();
    const consoleError = jest.spyOn(console, 'error');
    // react-aria reports "A component changed from uncontrolled to controlled" as a warning
    const consoleWarn = jest.spyOn(console, 'warn');

    render(
      <Select
        placeholder="Pick one"
        items={items}
      />,
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('option', { name: 'Option two' }));

    expect(screen.getByRole('button')).toHaveTextContent('Option two');
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  test('opens the list and reports the selected value', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();

    render(
      <Select
        placeholder="Pick one"
        items={items}
        onSelect={onSelect}
        description="Helpful text"
      />,
    );

    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect(screen.getByText('Helpful text')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(
      screen.getByRole('option', { name: 'Option three' }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('option', { name: 'Option two' }));

    expect(onSelect).toHaveBeenCalledWith('two');
    // The placeholder is kept as a caption above the selected value
    expect(screen.getByRole('button')).toHaveTextContent('Pick one');
    expect(screen.getByRole('button')).toHaveTextContent('Option two');
  });

  test('renders the default selected value', () => {
    render(
      <Select
        aria-label="Values"
        items={items}
        defaultSelectedKey="one"
      />,
    );

    expect(screen.getByRole('button')).toHaveTextContent('Option one');
  });
});

// FormSelect is wrapped in forwardRef, which drops its generic form type
type FormValues = FieldValues;

const FormSelectHarness = ({
  onSelect,
  onSubmit,
}: {
  onSelect: (value: string) => void;
  onSubmit: (values: FormValues) => void;
}) => {
  const { control, handleSubmit, clearErrors, setError } = useForm<FormValues>({
    defaultValues: { choice: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormSelect
        name="choice"
        control={control}
        clearErrors={clearErrors}
        placeholder="Choice"
        items={items}
        onSelect={onSelect}
      />
      <button
        type="button"
        onClick={() => setError('choice', { message: 'Choice is required' })}
      >
        invalidate
      </button>
      <button type="submit">submit</button>
    </form>
  );
};

describe('FormSelect', () => {
  test('writes the selected value into the form and clears its error', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onSubmit = jest.fn();

    render(
      <FormSelectHarness
        onSelect={onSelect}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'invalidate' }));
    expect(await screen.findByText('Choice is required')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Choice/ }));
    await user.click(screen.getByRole('option', { name: 'Option one' }));

    expect(onSelect).toHaveBeenCalledWith('one');
    expect(screen.queryByText('Choice is required')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'submit' }));
    expect(onSubmit).toHaveBeenCalledWith({ choice: 'one' }, expect.anything());
  });
});
