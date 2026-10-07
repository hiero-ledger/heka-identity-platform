import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import {
  LocationDisplay,
  makeSchema,
} from '@/pages/VerifyCredential/testUtils';
import { VerifyCredentialContext } from '@/pages/VerifyCredential/VerifyCredential.config';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import { RequestFieldsVerification } from './RequestFieldsVerification';

const schema = makeSchema();

const baseContext: VerifyCredentialContext = {
  wizardType: 'issue',
  protocolType: ProtocolType.Aries,
  credentialType: AriesCredentialFormat.AnoncredsIndy,
  network: 'indy',
  did: 'did:indy:issuer',
  schema,
};

const renderStep = (
  context: Partial<VerifyCredentialContext> = {},
  options: Parameters<typeof renderWithProviders>[1] = {},
) => {
  const onPrev = jest.fn();
  const onNext = jest.fn();
  const view = renderWithProviders(
    <>
      <RequestFieldsVerification
        title="Request fields verification"
        context={{ ...baseContext, ...context }}
        onPrev={onPrev}
        onNext={onNext}
      />
      <LocationDisplay />
    </>,
    options,
  );
  return { ...view, onPrev, onNext };
};

const checkbox = (name: string) =>
  screen
    .getAllByRole('checkbox')
    .find((el) => el.getAttribute('name') === name) as HTMLInputElement;

describe('RequestFieldsVerification', () => {
  test('shows the schema and protocol details and pre-selects the given attributes', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep({ attributes: ['lastName'] });

    expect(screen.getByText('Request fields verification')).toBeInTheDocument();
    expect(screen.getByText('Schema: Passport')).toBeInTheDocument();
    expect(
      screen.getByText('Protocol: Aries; Credential type: anoncreds-indy'),
    ).toBeInTheDocument();
    expect(checkbox('lastName')).toBeChecked();
    expect(checkbox('firstName')).not.toBeChecked();

    await user.click(checkbox('age'));
    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(onNext).toHaveBeenCalledWith(['lastName', 'age']);
  });

  test('disables Request until a field is selected and calls onPrev on Back', async () => {
    const user = userEvent.setup();
    const { onPrev, onNext } = renderStep();

    const request = screen.getByRole('button', { name: 'Request' });
    expect(request).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onPrev).toHaveBeenCalled();

    await user.click(checkbox('firstName'));
    expect(request).toBeEnabled();
    await user.click(request);
    expect(onNext).toHaveBeenCalledWith(['firstName']);
  });

  test('requests every field and locks the selection without selective disclosure', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep({
      protocolType: ProtocolType.Oid4vc,
      credentialType: Openid4CredentialFormat.JwtJson,
      attributes: ['age'],
    });

    expect(checkbox('firstName')).toBeChecked();
    expect(checkbox('firstName')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Request' }));
    expect(onNext).toHaveBeenCalledWith(['firstName', 'lastName', 'age']);
  });

  test('saves the selection as a new verification template and opens the template list', async () => {
    const user = userEvent.setup();
    const { api } = renderStep({ attributes: ['firstName', 'age'] });
    api.post.mockResolvedValue({ data: { id: 'tpl-new', name: 'Mine' } });

    await user.click(screen.getByRole('button', { name: 'Save as template' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Mine');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
      ),
    );
    expect(api.post).toHaveBeenCalledWith('/verification-templates', {
      name: 'Mine',
      protocol: ProtocolType.Aries,
      credentialFormat: AriesCredentialFormat.AnoncredsIndy,
      network: 'indy',
      did: 'did:indy:issuer',
      schemaId: 'schema-1',
      fields: [{ schemaFieldId: 'f-1' }, { schemaFieldId: 'f-3' }],
    });
  });

  test('offers a single Save for a new template', async () => {
    const user = userEvent.setup();
    renderStep({ wizardType: 'template' });

    expect(screen.getByText('New verification template')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('updates an existing template and returns to the template list', async () => {
    const user = userEvent.setup();
    const success = jest.spyOn(toast, 'success');
    const { api } = renderStep({
      wizardType: 'template',
      templateId: 'tpl-1',
      templateName: 'KYC check',
      attributes: ['lastName'],
    });

    expect(screen.getByText('Edit verification template')).toBeInTheDocument();
    expect(screen.getByText('Template: KYC check')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
      ),
    );
    expect(api.patch).toHaveBeenCalledWith(
      '/verification-templates/tpl-1',
      expect.objectContaining({
        schemaId: 'schema-1',
        fields: [{ schemaFieldId: 'f-2' }],
      }),
    );
    expect(success).toHaveBeenCalledWith(
      'Template KYC check was saved successfully',
    );
  });

  test('stays on the page when the template update fails', async () => {
    const user = userEvent.setup();
    const { api } = renderStep(
      {
        wizardType: 'template',
        templateId: 'tpl-1',
        templateName: 'KYC check',
      },
      { route: '/verify-credential/template' },
    );
    api.patch.mockRejectedValue({
      response: { data: { message: 'Update failed' } },
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/verify-credential/template',
    );
  });
});
