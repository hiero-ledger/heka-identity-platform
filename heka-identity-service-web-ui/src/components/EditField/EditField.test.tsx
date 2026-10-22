import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';
import { BackgroundColorField } from '@/components/BackgroundColorField';
import { BackgroundColorModalField } from '@/components/BackgroundColorModalField';
import { EditForm } from '@/components/EditForm';

import { EditField } from './EditField';

describe('EditField', () => {
  test('renders label and value and calls onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();

    render(
      <EditField
        labelKey="Profile.titles.issuer"
        onPress={onPress}
        alignOnStart
      >
        <span>ACME</span>
      </EditField>,
    );

    const button = screen.getByRole('button', { name: /Issuer/ });
    expect(button).toHaveTextContent('ACME');

    await user.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  test('hides the value and is disabled while loading', () => {
    render(
      <EditField
        labelKey="Profile.titles.issuer"
        isLoading
      >
        <span>ACME</span>
      </EditField>,
    );

    expect(screen.getByRole('button', { name: /Issuer/ })).toBeDisabled();
    expect(screen.queryByText('ACME')).not.toBeInTheDocument();
  });

  test('is disabled when editing is disabled', () => {
    render(
      <EditField
        labelKey="Profile.titles.name"
        isEditDisabled
      >
        <span>Jane</span>
      </EditField>,
    );

    expect(screen.getByRole('button', { name: /Name/ })).toBeDisabled();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  test('stays disabled when editing is disabled and loading has finished', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    render(
      <EditField
        labelKey="Profile.titles.name"
        isLoading={false}
        isEditDisabled
        onPress={onPress}
      >
        <span>Jane</span>
      </EditField>,
    );

    const field = screen.getByRole('button', { name: /Name/ });
    expect(field).toBeDisabled();
    await user.click(field);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('EditForm', () => {
  test('renders children and submits', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn((e) => e.preventDefault());

    render(
      <EditForm
        onSubmit={onSubmit}
        submitLabel="Profile.buttons.submit"
      >
        <input aria-label="field" />
      </EditForm>,
    );

    expect(screen.getByLabelText('field')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  test('disables the submit button', () => {
    render(
      <EditForm
        onSubmit={jest.fn()}
        submitLabel="Profile.buttons.submit"
        isSubmitDisabled
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('BackgroundColorField', () => {
  test('opens the color picker and reports the chosen color', async () => {
    const user = userEvent.setup();
    const selectColor = jest.fn();

    const { container } = render(
      <BackgroundColorField
        color="#ffffff"
        selectColor={selectColor}
        className="picker"
      />,
    );

    const input = container.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    const click = jest.spyOn(input, 'click');
    expect(input).toHaveValue('#ffffff');

    await user.click(screen.getByRole('button', { name: /Background color/ }));
    expect(click).toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(selectColor).toHaveBeenCalledWith('#ff0000');
  });
});

describe('BackgroundColorModalField', () => {
  const colorInput = () =>
    document.querySelector('input[type="color"]') as HTMLInputElement;

  test('opens a modal and submits the chosen color', async () => {
    const user = userEvent.setup();
    const submitColor = jest.fn();

    render(
      <BackgroundColorModalField
        color="#ffffff"
        submitColor={submitColor}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Background color/ }));

    expect(
      await screen.findByRole('heading', { name: 'Background color' }),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(colorInput(), { target: { value: '#00ff00' } });
    expect(save).toBeEnabled();

    await user.click(save);

    await waitFor(() =>
      expect(submitColor).toHaveBeenCalledWith({ color: '#00ff00' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Background color' }),
      ).not.toBeInTheDocument(),
    );
  });

  test('discards the chosen color when the modal is closed', async () => {
    const user = userEvent.setup();
    const submitColor = jest.fn();

    render(
      <BackgroundColorModalField
        color="#ffffff"
        submitColor={submitColor}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Background color/ }));
    await screen.findByRole('heading', { name: 'Background color' });
    fireEvent.change(colorInput(), { target: { value: '#00ff00' } });

    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Background color' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /Background color/ }));
    await screen.findByRole('heading', { name: 'Background color' });
    expect(colorInput()).toHaveValue('#ffffff');
    expect(submitColor).not.toHaveBeenCalled();
  });
});
