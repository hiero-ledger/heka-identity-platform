import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

// All icons share one SVG stub module; render them as spans that keep their props (role,
// tabIndex, aria-label, handlers) so the icon buttons can be found and operated
jest.mock('@/shared/assets/icons/visibility-off.svg', () => ({
  __esModule: true,
  default: (props: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props} />
  ),
}));

import { Schema } from './Schema';
import { SchemaItem } from './types';

const renderSchema = (schema: SchemaItem) => {
  const callbacks = {
    onVisibilityChanged: jest.fn(),
    onChange: jest.fn(),
    onRegistrationsClick: jest.fn(),
  };
  const result = renderWithProviders(
    <DndContext>
      <SortableContext items={[schema.id]}>
        <Schema
          schema={schema}
          {...callbacks}
        />
      </SortableContext>
    </DndContext>,
  );
  return { ...result, ...callbacks };
};

describe('Schema', () => {
  afterEach(() => jest.restoreAllMocks());

  test('renders a visible schema with its logo and registrations', async () => {
    const user = userEvent.setup();
    const { onChange, onRegistrationsClick } = renderSchema({
      id: 's1',
      name: 'Passport',
      logo: '/passport.png',
      bgColor: '#000000',
      registrationsCount: 3,
    });

    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      '/passport.png',
    );
    expect(screen.getByTitle('Hide schema')).toBeInTheDocument();
    expect(screen.getByTitle('Move schema')).toBeInTheDocument();

    await user.click(screen.getByText('Passport'));
    expect(onChange).toHaveBeenCalledWith('s1');

    await user.click(screen.getByText('Registered 3 times'));
    expect(onRegistrationsClick).toHaveBeenCalledWith('s1');
  });

  test('uses defaults for logo and registrations', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSchema({ id: 's2', name: 'Diploma' });

    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      '/default-schema-avatar.png',
    );
    expect(screen.getByText('Not registered')).toBeInTheDocument();

    await user.click(screen.getByRole('img', { name: 'Logo' }));
    expect(onChange).toHaveBeenCalledWith('s2');
  });

  test('offers edit and register actions in its menu', async () => {
    const user = userEvent.setup();
    const { onChange, onRegistrationsClick } = renderSchema({
      id: 's1',
      name: 'Passport',
    });

    const openMenu = () =>
      user.click(
        screen.getByTitle('Actions with schema').querySelector('button')!,
      );

    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onChange).toHaveBeenCalledWith('s1');

    await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Register' }));
    expect(onRegistrationsClick).toHaveBeenCalledWith('s1');
  });

  test('hides a visible schema', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const schema = { id: 's1', name: 'Passport', isHidden: false };
    const { api, onVisibilityChanged } = renderSchema(schema);

    await user.click(screen.getByRole('button', { name: 'Hide schema' }));

    await waitFor(() =>
      expect(onVisibilityChanged).toHaveBeenCalledWith(schema),
    );
    expect(api.patch).toHaveBeenCalledWith(
      '/v2/schemas/s1',
      expect.any(FormData),
    );
    expect((api.patch.mock.calls[0][1] as FormData).get('isHidden')).toBe(
      'true',
    );
    expect(success).toHaveBeenCalledWith('Schema was hidden successfully');
  });

  test('shows a hidden schema without a menu', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const schema = { id: 's3', name: 'Old', isHidden: true };
    const { api, onVisibilityChanged } = renderSchema(schema);

    expect(screen.getByTitle('Show schema')).toBeInTheDocument();
    expect(screen.queryByTitle('Actions with schema')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show schema' }));

    await waitFor(() =>
      expect(onVisibilityChanged).toHaveBeenCalledWith(schema),
    );
    expect((api.patch.mock.calls[0][1] as FormData).get('isHidden')).toBe(
      'false',
    );
    expect(success).toHaveBeenCalledWith('Schema was activated successfully');
  });

  test('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    const schema = { id: 's1', name: 'Passport', isHidden: false };
    const { onVisibilityChanged, onChange, onRegistrationsClick } =
      renderSchema(schema);

    const hide = screen.getByRole('button', { name: 'Hide schema' });
    hide.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(onVisibilityChanged).toHaveBeenCalledWith(schema),
    );

    screen.getByRole('button', { name: 'Passport' }).focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('s1');

    const registrations = screen.getByRole('button', {
      name: 'Not registered',
    });
    expect(registrations).toHaveAttribute('tabindex', '0');
    registrations.focus();
    await user.keyboard('{Enter}');
    expect(onRegistrationsClick).toHaveBeenCalledWith('s1');
  });

  test('keeps the schema when changing visibility fails', async () => {
    const user = userEvent.setup();
    const error = jest.spyOn(toast, 'error');
    const { api, onVisibilityChanged } = renderSchema({
      id: 's1',
      name: 'Passport',
    });
    api.patch.mockRejectedValue({
      response: { data: { message: 'Schema not found' } },
    });

    await user.click(screen.getByRole('button', { name: 'Hide schema' }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Schema not found'));
    expect(onVisibilityChanged).not.toHaveBeenCalled();
  });
});
