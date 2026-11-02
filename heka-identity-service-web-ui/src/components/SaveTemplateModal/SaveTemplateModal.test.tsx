import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import '@/translations';
import { SaveIssuanceTemplateModal } from '@/components/SaveIssuanceTemplateModal';
import { SaveVerificationTemplateModal } from '@/components/SaveVerificationTemplateModal';
import {
  AriesCredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import { SaveTemplateModal } from './SaveTemplateModal';

const fillName = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  await user.type(await screen.findByPlaceholderText('Template name'), name);
};

const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('SaveTemplateModal', () => {
  afterEach(() => jest.restoreAllMocks());

  test('saves the template under the typed name', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();

    render(
      <SaveTemplateModal
        isOpen
        isLoading={false}
        onSave={onSave}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Save as template' }),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await fillName(user, 'KYC');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await user.click(saveButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSave).toHaveBeenCalledWith('KYC');
    expect(success).toHaveBeenCalledWith(
      'Template KYC was created successfully',
    );
  });

  test('stays open when saving fails', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockRejectedValue(new Error('boom'));
    const onOpenChange = jest.fn();

    render(
      <SaveTemplateModal
        isOpen
        isLoading={false}
        onSave={onSave}
        onOpenChange={onOpenChange}
      />,
    );

    await fillName(user, 'KYC');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await user.click(saveButton());

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Template name')).toHaveValue(''),
    );
    expect(onSave).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('reports closing', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    render(
      <SaveTemplateModal
        isOpen
        isLoading={false}
        onSave={jest.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(
      screen.getAllByRole('button', { name: 'close button' })[1],
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('disables saving while loading', async () => {
    render(
      <SaveTemplateModal
        isOpen
        isLoading
        onSave={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await waitFor(() => expect(saveButton()).toBeDisabled());
  });
});

const schema = {
  id: 'schema-1',
  name: 'Passport',
  fields: [
    { id: 'f1', name: 'first_name' },
    { id: 'f2', name: 'last_name' },
  ],
} as Schema;

describe('SaveIssuanceTemplateModal', () => {
  test('creates an issuance template from the wizard context', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    const { api } = renderWithProviders(
      <SaveIssuanceTemplateModal
        isOpen
        onOpenChange={onOpenChange}
        context={{
          protocolType: ProtocolType.Aries,
          credentialType: AriesCredentialFormat.AnoncredsIndy,
          network: 'indy',
          did: 'did:indy:1',
          schema,
          credentialValues: { first_name: 'Jane', last_name: 'Doe' },
        }}
      />,
    );
    api.post.mockResolvedValue({ data: { id: 'tpl-1', name: 'KYC' } });

    await fillName(user, 'KYC');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await user.click(saveButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.post).toHaveBeenCalledWith('/issuance-templates', {
      name: 'KYC',
      protocol: ProtocolType.Aries,
      credentialFormat: AriesCredentialFormat.AnoncredsIndy,
      network: 'indy',
      did: 'did:indy:1',
      schemaId: 'schema-1',
      fields: [
        { schemaFieldId: 'f1', value: 'Jane' },
        { schemaFieldId: 'f2', value: 'Doe' },
      ],
    });
  });
});

describe('SaveVerificationTemplateModal', () => {
  test('creates a verification template from the wizard context', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    const { api } = renderWithProviders(
      <SaveVerificationTemplateModal
        isOpen
        onOpenChange={onOpenChange}
        context={{
          protocolType: ProtocolType.Aries,
          credentialType: AriesCredentialFormat.AnoncredsIndy,
          network: 'indy',
          did: 'did:indy:1',
          schema,
          attributes: ['last_name'],
        }}
      />,
    );
    api.post.mockResolvedValue({ data: { id: 'tpl-2', name: 'Age check' } });

    await fillName(user, 'Age check');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await user.click(saveButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.post).toHaveBeenCalledWith('/verification-templates', {
      name: 'Age check',
      protocol: ProtocolType.Aries,
      credentialFormat: AriesCredentialFormat.AnoncredsIndy,
      network: 'indy',
      did: 'did:indy:1',
      schemaId: 'schema-1',
      fields: [{ schemaFieldId: 'f2' }],
    });
  });
});
