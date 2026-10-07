import { DragEndEvent } from '@dnd-kit/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropsWithChildren } from 'react';
import toast from 'react-hot-toast';

import { SchemaProps } from '@/components/Schema/types';
import { Schema as SchemaType } from '@/entities/Schema';
import { DidDocument } from '@/entities/User/model/types/user';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import {
  INDY_DID,
  KEY_DID,
  registeredSchema,
  routeAgencyGets,
  unregisteredSchema,
} from '../testUtils';
import { Schemas } from './Schemas';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

// Capture the drag handler instead of simulating pointer gestures in jsdom
let onDragEnd: ((event: DragEndEvent) => Promise<void>) | undefined;
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  DndContext: ({
    children,
    onDragEnd: handler,
  }: PropsWithChildren<{ onDragEnd: typeof onDragEnd }>) => {
    onDragEnd = handler;
    return <>{children}</>;
  },
}));
jest.mock('@dnd-kit/sortable', () => ({
  ...jest.requireActual('@dnd-kit/sortable'),
  SortableContext: ({ children }: PropsWithChildren) => <>{children}</>,
}));

// The schema card is tested on its own; expose its callbacks as plain buttons
jest.mock('@/components/Schema/Schema', () => ({
  Schema: ({
    schema,
    onChange,
    onRegistrationsClick,
    onVisibilityChanged,
  }: SchemaProps) => (
    <div data-testid="schema-card">
      <span>{schema.name}</span>
      <button onClick={() => onChange(schema.id)}>Edit {schema.name}</button>
      <button onClick={() => onRegistrationsClick(schema.id)}>
        Registrations of {schema.name}
      </button>
      <button onClick={() => onVisibilityChanged(schema)}>
        Hide {schema.name}
      </button>
    </div>
  ),
}));

jest.mock('@/components/CreateSchema/CreateSchema', () => ({
  CreateSchemaModal: ({
    isOpen,
    onOpenChange,
    onSchemaCreated,
  }: {
    isOpen: boolean;
    onOpenChange: (value: boolean) => void;
    onSchemaCreated: () => void;
  }) =>
    isOpen ? (
      <div>
        <button onClick={() => onSchemaCreated()}>finish creating</button>
        <button onClick={() => onOpenChange(false)}>close creating</button>
      </div>
    ) : null,
}));

const renderSchemas = (
  schemas: SchemaType[] = [registeredSchema],
  dids?: DidDocument[],
) => {
  const api = createMockApi();
  routeAgencyGets(api, { schemas, dids });
  const result = renderWithProviders(<Schemas />, { api });
  return { ...result, user: userEvent.setup() };
};

const schemaListCalls = (api: MockApi) =>
  api.get.mock.calls.filter(([url]) => url === '/v2/schemas');

const dragEvent = (
  [activeId, activeIndex]: [string, number],
  [overId, overIndex]: [string, number],
) =>
  ({
    active: {
      id: activeId,
      data: { current: { sortable: { index: activeIndex } } },
    },
    over: { id: overId, data: { current: { sortable: { index: overIndex } } } },
  }) as unknown as DragEndEvent;

describe('Schemas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onDragEnd = undefined;
  });

  test('lists the active schemas and switches to the hidden ones', async () => {
    const { api, user } = renderSchemas([registeredSchema, unregisteredSchema]);

    expect(await screen.findByText('Passport')).toBeInTheDocument();
    expect(screen.getByText('Diploma')).toBeInTheDocument();
    expect(schemaListCalls(api)[0][1]).toEqual({
      params: { isHidden: false },
    });

    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    routeAgencyGets(api, { schemas: [] });
    await user.click(screen.getByRole('button', { name: 'Hidden' }));
    expect(screen.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(
      await screen.findByText('There are no hidden schemes'),
    ).toBeInTheDocument();
    expect(schemaListCalls(api).at(-1)![1]).toEqual({
      params: { isHidden: true },
    });

    await user.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() =>
      expect(schemaListCalls(api).at(-1)![1]).toEqual({
        params: { isHidden: false },
      }),
    );
  });

  test('offers to create the first schema and reloads the list afterwards', async () => {
    const { api, user } = renderSchemas([]);

    expect(
      await screen.findByText('There are no active schemes'),
    ).toBeInTheDocument();
    const callsBefore = schemaListCalls(api).length;

    // Both the header plus button and the empty-state button are labelled "Create schema"
    const [, emptyStateButton] = screen.getAllByRole('button', {
      name: 'Create schema',
    });
    await user.click(emptyStateButton);
    await user.click(screen.getByRole('button', { name: 'finish creating' }));
    await waitFor(() =>
      expect(schemaListCalls(api).length).toBeGreaterThan(callsBefore),
    );

    await user.click(screen.getByRole('button', { name: 'close creating' }));
    expect(
      screen.queryByRole('button', { name: 'finish creating' }),
    ).toBeNull();
  });

  test('the header button opens schema creation', async () => {
    const { user } = renderSchemas();
    await screen.findByText('Passport');

    await user.click(
      screen.getAllByRole('button', { name: 'Create schema' })[0],
    );

    expect(
      screen.getByRole('button', { name: 'finish creating' }),
    ).toBeInTheDocument();
  });

  test('a hidden schema leaves the active list', async () => {
    const { user } = renderSchemas([registeredSchema, unregisteredSchema]);
    await screen.findByText('Diploma');

    await user.click(screen.getByRole('button', { name: 'Hide Diploma' }));

    expect(screen.queryByText('Diploma')).toBeNull();
    expect(screen.getByText('Passport')).toBeInTheDocument();
  });

  test('saves the new order after a drag', async () => {
    const { api } = renderSchemas([registeredSchema, unregisteredSchema]);
    await screen.findByText('Diploma');

    await act(() =>
      onDragEnd!(
        dragEvent([unregisteredSchema.id, 1], [registeredSchema.id, 0]),
      ),
    );

    const cards = screen.getAllByTestId('schema-card');
    expect(cards[0]).toHaveTextContent('Diploma');
    expect(cards[1]).toHaveTextContent('Passport');
    expect(api.patch).toHaveBeenCalledWith(
      `/v2/schemas/${unregisteredSchema.id}`,
      expect.any(FormData),
    );
    // Moved to the top: the backend reads "null" as "first"
    const formData = api.patch.mock.calls[0][1] as FormData;
    expect(formData.get('previousSchemaId')).toBe('null');
  });

  test('sends the schema now placed before the moved one', async () => {
    const { api } = renderSchemas([registeredSchema, unregisteredSchema]);
    await screen.findByText('Diploma');

    await act(() =>
      onDragEnd!(
        dragEvent([registeredSchema.id, 0], [unregisteredSchema.id, 1]),
      ),
    );

    const formData = api.patch.mock.calls[0][1] as FormData;
    expect(formData.get('previousSchemaId')).toBe(unregisteredSchema.id);
  });

  test('restores the previous order when saving it fails', async () => {
    const { api } = renderSchemas([registeredSchema, unregisteredSchema]);
    api.patch.mockRejectedValue({
      response: { data: { message: 'Reorder failed' } },
    });
    await screen.findByText('Diploma');

    await act(() =>
      onDragEnd!(
        dragEvent([unregisteredSchema.id, 1], [registeredSchema.id, 0]),
      ),
    );

    const cards = screen.getAllByTestId('schema-card');
    expect(cards[0]).toHaveTextContent('Passport');
    expect(cards[1]).toHaveTextContent('Diploma');
  });

  test('ignores a drag that ends where it started', async () => {
    const { api } = renderSchemas([registeredSchema, unregisteredSchema]);
    await screen.findByText('Diploma');

    await act(() =>
      onDragEnd!(dragEvent([registeredSchema.id, 0], [registeredSchema.id, 0])),
    );

    expect(api.patch).not.toHaveBeenCalled();
  });

  describe('editor', () => {
    test('saves a new background color', async () => {
      const { api, user } = renderSchemas();
      await user.click(
        await screen.findByRole('button', { name: 'Edit Passport' }),
      );

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Passport')).toBeInTheDocument();
      expect(within(dialog).getByText('firstName')).toBeInTheDocument();
      const save = within(dialog).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();

      const colorInput = dialog.querySelector(
        'input[type="color"]',
      ) as HTMLInputElement;
      // jsdom has no color picker; set the value the way the browser would
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!;
        setter.call(colorInput, '#ff0000');
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      api.patch.mockResolvedValueOnce({ data: { logo: undefined } });
      await waitFor(() => expect(save).toBeEnabled());
      await user.click(save);

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Schema was saved successfully',
        ),
      );
      const formData = api.patch.mock.calls[0][1] as FormData;
      expect(api.patch.mock.calls[0][0]).toBe(
        `/v2/schemas/${registeredSchema.id}`,
      );
      expect(formData.get('bgColor')).toBe('#ff0000');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    test('uploads a new logo and stays open when saving fails', async () => {
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = jest.fn(() => 'blob:logo');
      try {
        const { api, user } = renderSchemas();
        await user.click(
          await screen.findByRole('button', { name: 'Edit Passport' }),
        );
        const dialog = await screen.findByRole('dialog');

        const file = new File(['png'], 'logo.png', { type: 'image/png' });
        await user.upload(
          dialog.querySelector('input[type="file"]') as HTMLInputElement,
          file,
        );
        api.patch.mockRejectedValueOnce({
          response: { data: { message: 'File too large' } },
        });
        await user.click(within(dialog).getByRole('button', { name: 'Save' }));

        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith('File too large'),
        );
        expect((api.patch.mock.calls[0][1] as FormData).get('logo')).toEqual(
          file,
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      } finally {
        URL.createObjectURL = originalCreateObjectURL;
      }
    });

    test('closes without saving', async () => {
      const { api, user } = renderSchemas();
      await user.click(
        await screen.findByRole('button', { name: 'Edit Passport' }),
      );
      await screen.findByRole('dialog');

      await user.click(
        screen.getAllByRole('button', { name: 'close button' })[0],
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(api.patch).not.toHaveBeenCalled();
    });
  });

  describe('registrations', () => {
    test('lists the registrations of a schema', async () => {
      const { user, api } = renderSchemas();
      await user.click(
        await screen.findByRole('button', {
          name: 'Registrations of Passport',
        }),
      );

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Registrations')).toBeInTheDocument();
      expect(within(dialog).getByText(INDY_DID)).toBeInTheDocument();
      expect(within(dialog).getByText('anoncreds')).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledWith('/dids', {
        params: { own: true, method: undefined },
      });
    });

    test('says when a schema is not registered anywhere', async () => {
      const { user } = renderSchemas([unregisteredSchema]);
      await user.click(
        await screen.findByRole('button', { name: 'Registrations of Diploma' }),
      );

      expect(
        await screen.findByText('The schema is not registered'),
      ).toBeInTheDocument();
    });

    test('registers the schema for a chosen target', async () => {
      const { user, api } = renderSchemas([unregisteredSchema]);
      await user.click(
        await screen.findByRole('button', { name: 'Registrations of Diploma' }),
      );
      await screen.findByText('The schema is not registered');

      await user.click(
        await screen.findByRole('button', { name: 'Register schema' }),
      );
      expect(await screen.findByText('Registration')).toBeInTheDocument();

      const submit = screen.getByRole('button', { name: 'Register' });
      expect(submit).toBeDisabled();

      // Two protocols are possible, so the protocol has to be chosen
      await user.click(screen.getByRole('button', { name: /Protocol type/ }));
      await user.click(
        await screen.findByRole('option', { name: 'OpenId4VC' }),
      );
      await user.click(
        screen.getByRole('button', { name: /Credential format/ }),
      );
      await user.click(
        await screen.findByRole('option', { name: 'jwt_vc_json' }),
      );

      // Only one network and DID fit, so they are filled in
      await waitFor(() => expect(submit).toBeEnabled());
      api.get.mockClear();
      await user.click(submit);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          `/v2/schemas/${unregisteredSchema.id}/registration`,
          {
            protocol: 'OpenId4VC',
            credentialFormat: 'jwt_vc_json',
            network: 'key',
            did: KEY_DID,
          },
        ),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Schema was registered successfully',
        ),
      );
    });

    test('enables Register as soon as a DID is chosen', async () => {
      // Two key DIDs: the DID is not filled in automatically
      const secondKeyDid = 'did:key:z6MkSecondIssuer';
      const { user } = renderSchemas(
        [unregisteredSchema],
        [
          { id: KEY_DID, verificationMethod: [] },
          { id: secondKeyDid, verificationMethod: [] },
        ],
      );
      await user.click(
        await screen.findByRole('button', { name: 'Registrations of Diploma' }),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Register schema' }),
      );
      const submit = await screen.findByRole('button', { name: 'Register' });

      await user.click(
        screen.getByRole('button', { name: /Credential format/ }),
      );
      await user.click(
        await screen.findByRole('option', { name: 'jwt_vc_json' }),
      );
      expect(submit).toBeDisabled();

      await user.click(screen.getByRole('button', { name: /^DID/ }));
      await user.click(
        await screen.findByRole('option', { name: secondKeyDid }),
      );

      // Nothing else re-renders the form here: the button must follow the DID itself
      await waitFor(() => expect(submit).toBeEnabled());
    });

    test('keeps the registration form open when registering fails', async () => {
      // Only the indy DID exists, so every field has a single choice
      const { user, api } = renderSchemas(
        [{ ...registeredSchema, registrations: [] }],
        [{ id: INDY_DID, verificationMethod: [] }],
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Registrations of Passport',
        }),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Register schema' }),
      );
      const submit = await screen.findByRole('button', { name: 'Register' });

      await waitFor(() => expect(submit).toBeEnabled());
      api.post.mockRejectedValueOnce({
        response: { data: { message: 'DID not on ledger' } },
      });
      await user.click(submit);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('DID not on ledger'),
      );
      expect(
        screen.getByRole('button', { name: 'Register' }),
      ).toBeInTheDocument();
    });
  });
});
