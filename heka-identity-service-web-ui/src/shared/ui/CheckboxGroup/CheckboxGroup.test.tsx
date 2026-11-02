import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

import { CheckboxGroup } from './CheckboxGroup';

const options = ['name', 'age', 'city'];

describe('CheckboxGroup', () => {
  // The first checkbox is "Select all", then one per option
  const checkboxes = () => screen.getAllByRole('checkbox');

  test('labels every checkbox, and its label text toggles it', async () => {
    const user = userEvent.setup();
    const setSelected = jest.fn();
    const consoleError = jest.spyOn(console, 'error');

    render(
      <CheckboxGroup
        options={options}
        setSelected={setSelected}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Select all' }),
    ).not.toBeChecked();
    const age = screen.getByRole('checkbox', { name: 'age' });
    expect(age).not.toBeChecked();

    await user.click(screen.getByText('age'));

    expect(age).toBeChecked();
    expect(setSelected).toHaveBeenLastCalledWith(['age']);
    // Neither "uncontrolled to controlled" nor "cannot update a component while rendering"
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('renders nothing without options', () => {
    const { container } = render(
      <CheckboxGroup
        options={[]}
        setSelected={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('renders initial selection and toggles single options', async () => {
    const user = userEvent.setup();
    const setSelected = jest.fn();

    render(
      <CheckboxGroup
        options={options}
        initial={['age']}
        setSelected={setSelected}
      />,
    );

    expect(screen.getByText('Select all')).toBeInTheDocument();
    options.forEach((option) =>
      expect(screen.getByText(option)).toBeInTheDocument(),
    );
    expect(checkboxes()[2]).toBeChecked();

    await user.click(checkboxes()[1]);
    expect(setSelected).toHaveBeenLastCalledWith(['age', 'name']);

    await user.click(checkboxes()[2]);
    expect(setSelected).toHaveBeenLastCalledWith(['name']);
  });

  test('select all toggles every option on and off', async () => {
    const user = userEvent.setup();
    const setSelected = jest.fn();

    render(
      <CheckboxGroup
        options={options}
        initial={['city']}
        setSelected={setSelected}
      />,
    );

    await user.click(checkboxes()[0]);
    expect(setSelected).toHaveBeenLastCalledWith(options);
    expect(checkboxes()[0]).toBeChecked();

    await user.click(checkboxes()[0]);
    expect(setSelected).toHaveBeenLastCalledWith([]);
    expect(checkboxes()[0]).not.toBeChecked();
  });

  test('disables every checkbox', () => {
    render(
      <CheckboxGroup
        options={options}
        initial={options}
        setSelected={jest.fn()}
        disabled
      />,
    );

    checkboxes().forEach((checkbox) => expect(checkbox).toBeDisabled());
    expect(checkboxes()[0]).toBeChecked();
  });
});
