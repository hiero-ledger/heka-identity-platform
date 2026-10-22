import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import '@/translations';

import { TextField } from './TextField';

describe('TextField', () => {
  test('edits the value in a modal and submits it', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(
      <TextField
        labelKey="Profile.titles.issuer"
        field="name"
        value="ACME"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Issuer/ }));

    expect(
      await screen.findByRole('heading', { name: 'Issuer' }),
    ).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Issuer');
    expect(input).toHaveValue('ACME');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'Globex');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ field: 'name', value: 'Globex' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Issuer' }),
      ).not.toBeInTheDocument(),
    );
  });

  test('keeps submit disabled while the value is invalid', async () => {
    const user = userEvent.setup();

    render(
      <TextField
        labelKey="Profile.titles.issuer"
        field="name"
        value="ACME"
        onSubmit={jest.fn()}
        fieldValidator={{ required: { value: true, message: 'Required' } }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Issuer/ }));
    await user.clear(await screen.findByPlaceholderText('Issuer'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(),
    );
  });

  test('resets unsaved edits when the modal is closed', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(
      <TextField
        labelKey="Profile.titles.issuer"
        field="name"
        value="ACME"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Issuer/ }));
    await user.type(await screen.findByPlaceholderText('Issuer'), ' Corp');
    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Issuer')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /Issuer/ }));
    expect(await screen.findByPlaceholderText('Issuer')).toHaveValue('ACME');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('cannot be opened when editing is disabled', async () => {
    render(
      <TextField
        labelKey="Profile.titles.name"
        field="username"
        value="Jane"
        onSubmit={jest.fn()}
        isEditDisabled
      />,
    );

    expect(screen.getByRole('button', { name: /Name/ })).toBeDisabled();
    // Let the form finish its initial validation
    expect(await screen.findByText('Jane')).toBeInTheDocument();
  });
});
