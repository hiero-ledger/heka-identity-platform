import { DragEndEvent } from '@dnd-kit/core';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropsWithChildren } from 'react';
import toast from 'react-hot-toast';

import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

// Capture the drag handler instead of simulating pointer gestures in jsdom
let mockOnDragEnd: ((event: DragEndEvent) => void) | undefined;
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  DndContext: ({
    children,
    onDragEnd,
  }: PropsWithChildren<{ onDragEnd: (event: DragEndEvent) => void }>) => {
    mockOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
}));
// Record the sortable ids (react-hook-form field ids) in render order
const mockSortableIds: string[] = [];
jest.mock('@dnd-kit/sortable', () => {
  const actual = jest.requireActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: (args: { id: string }) => {
      mockSortableIds.push(args.id);
      return actual.useSortable(args);
    },
  };
});

import { CreateSchemaModal } from './CreateSchema';

type User = ReturnType<typeof userEvent.setup>;

const credentialInputs = () =>
  screen.queryAllByPlaceholderText('Credential field') as HTMLInputElement[];

// The "new credential field" input creates a field on the first keystroke and moves the
// focus to it, so the rest of the name is typed into the created field
const addCredential = async (user: User, name: string) => {
  const before = credentialInputs().length;
  await user.type(screen.getByPlaceholderText('New credential field'), name[0]);
  await waitFor(() => expect(credentialInputs()).toHaveLength(before + 1));
  const input = credentialInputs()[before];
  await waitFor(() => expect(input).toHaveFocus());
  if (name.length > 1) await user.type(input, name.slice(1));
};

const createButton = () => screen.getByRole('button', { name: 'Create' });

const renderModal = () => {
  const onOpenChange = jest.fn();
  const onSchemaCreated = jest.fn();
  const result = renderWithProviders(
    <CreateSchemaModal
      isOpen
      onOpenChange={onOpenChange}
      onSchemaCreated={onSchemaCreated}
    />,
  );
  return { ...result, onOpenChange, onSchemaCreated };
};

describe('CreateSchemaModal', () => {
  // Typing several fields through the modal is slow when the whole suite runs in parallel
  jest.setTimeout(30000);

  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    mockSortableIds.length = 0;
    global.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    });
    URL.createObjectURL = jest.fn(() => 'blob:logo');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    jest.restoreAllMocks();
  });

  test('creates a schema with its fields, logo and color', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const { api, onOpenChange, onSchemaCreated } = renderModal();
    const created = { id: 'schema-1', name: 'Passport' };
    api.post.mockResolvedValue({ data: created });

    expect(
      screen.getByRole('heading', { name: 'Create schema' }),
    ).toBeInTheDocument();
    // The default logo is loaded as a file to be uploaded
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Schema logo' })).toHaveAttribute(
        'src',
        'blob:logo',
      ),
    );
    expect(createButton()).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Schema name'), 'Passport');
    await addCredential(user, 'first_name');
    await addCredential(user, 'last_name');

    await waitFor(() => expect(createButton()).toBeEnabled());
    await user.click(createButton());

    await waitFor(() => expect(onSchemaCreated).toHaveBeenCalledWith(created));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(success).toHaveBeenCalledWith('Schema was created successfully');

    const [url, formData] = api.post.mock.calls[0] as [string, FormData];
    expect(url).toBe('/v2/schemas');
    expect(formData.get('name')).toBe('Passport');
    expect(formData.getAll('fields[]')).toEqual(['first_name', 'last_name']);
    expect(formData.get('bgColor')).toBe('#FFFFFF');
    expect((formData.get('logo') as File).name).toBe('default_image.jpg');
  });

  test('rejects duplicate credential field names', async () => {
    const user = userEvent.setup();
    const { api } = renderModal();

    await user.type(screen.getByPlaceholderText('Schema name'), 'Passport');
    await addCredential(user, 'name');
    await addCredential(user, 'name');

    await waitFor(() => expect(createButton()).toBeEnabled());
    await user.click(createButton());

    expect(
      await screen.findByText('Credential fields names must be unique'),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    // Editing a field clears the error
    await user.type(credentialInputs()[1], '2');
    await waitFor(() =>
      expect(
        screen.queryByText('Credential fields names must be unique'),
      ).not.toBeInTheDocument(),
    );
  });

  test('shows the server error and reloads the schema list when creation fails', async () => {
    const user = userEvent.setup();
    const { api, onOpenChange } = renderModal();
    api.post.mockRejectedValue({
      response: { data: { message: 'Schema already exists' } },
    });
    api.get.mockResolvedValue({ data: { items: [] } });

    await user.type(screen.getByPlaceholderText('Schema name'), 'Passport');
    await addCredential(user, 'number');
    await waitFor(() => expect(createButton()).toBeEnabled());
    await user.click(createButton());

    expect(
      await screen.findByText('Schema already exists', {
        selector: 'div',
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/v2/schemas', {
        params: { isHidden: false },
      }),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('registers each field once, without passing refs to TextInput', async () => {
    const user = userEvent.setup();
    const consoleError = jest.spyOn(console, 'error');
    renderModal();

    await user.type(screen.getByPlaceholderText('Schema name'), 'Passport');
    await addCredential(user, 'number');

    // A field spread from `register()` onto the Controller-based TextInput hands it a ref
    // it cannot take, and registers the field a second time
    const refWarnings = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('Function components cannot be given refs'),
    );
    expect(refWarnings).toEqual([]);
    expect(credentialInputs()[0]).toHaveValue('number');
  });

  test('removes a credential field', async () => {
    const user = userEvent.setup();
    renderModal();

    await addCredential(user, 'first');
    await addCredential(user, 'second');

    await user.click(
      screen.getAllByRole('button', { name: 'Delete credential field' })[0],
    );

    await waitFor(() => expect(credentialInputs()).toHaveLength(1));
    expect(credentialInputs()[0]).toHaveValue('second');
  });

  test('reorders credential fields by drag and drop', async () => {
    const user = userEvent.setup();
    renderModal();

    await addCredential(user, 'first');
    await addCredential(user, 'second');

    const [firstId, secondId] = Array.from(new Set(mockSortableIds));
    act(() => {
      mockOnDragEnd?.({
        active: { id: firstId },
        over: { id: secondId },
      } as unknown as DragEndEvent);
    });

    await waitFor(() =>
      expect(credentialInputs().map((input) => input.value)).toEqual([
        'second',
        'first',
      ]),
    );

    // Dropping onto itself or outside keeps the order
    act(() => {
      mockOnDragEnd?.({
        active: { id: firstId },
        over: null,
      } as unknown as DragEndEvent);
    });
    expect(credentialInputs().map((input) => input.value)).toEqual([
      'second',
      'first',
    ]);
  });

  test('resets the form when closed', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.type(screen.getByPlaceholderText('Schema name'), 'Draft');
    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Schema name')).toHaveValue(''),
    );
  });

  test('still uploads the default logo as a file after the form was reset', async () => {
    const user = userEvent.setup();
    const { api } = renderModal();
    api.post.mockResolvedValue({ data: { id: 'schema-2', name: 'Visa' } });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Schema logo' })).toHaveAttribute(
        'src',
        'blob:logo',
      ),
    );

    // Closing resets the form, as creating a schema does
    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );
    await user.type(screen.getByPlaceholderText('Schema name'), 'Visa');
    await addCredential(user, 'number');
    await waitFor(() => expect(createButton()).toBeEnabled());
    await user.click(createButton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const formData = api.post.mock.calls[0][1] as FormData;
    const logo = formData.get('logo');
    expect(logo).toBeInstanceOf(File);
    expect((logo as File).name).toBe('default_image.jpg');
  });

  test('sends no logo when the default logo cannot be loaded', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const { api } = renderModal();
    api.post.mockResolvedValue({ data: { id: 'schema-3', name: 'Visa' } });

    await user.type(screen.getByPlaceholderText('Schema name'), 'Visa');
    await addCredential(user, 'number');
    await waitFor(() => expect(createButton()).toBeEnabled());
    await user.click(createButton());

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const formData = api.post.mock.calls[0][1] as FormData;
    // Never the image path as a text field
    expect(formData.has('logo')).toBe(false);
  });

  test('keeps working when the default logo cannot be loaded', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    renderModal();

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load default image',
        expect.any(Error),
      ),
    );
    expect(screen.getByRole('img', { name: 'Schema logo' })).toHaveAttribute(
      'src',
      '/default-schema-avatar.png',
    );
  });
});
