import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OpenIdPresentationState } from '@/entities/Presentation/model/types/presentation';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';
import i18n from '@/translations';

import AgeVerificationDemo from './AgeVerificationDemo';

// The demo DID comes from an env var that is empty under jest
jest.mock('@/const/user', () => ({
  ...jest.requireActual('@/const/user'),
  demoUser: { did: 'did:key:demo' },
}));
jest.mock('@/components/Steps', () => ({
  ...jest.requireActual('@/components/Steps'),
  FillCredentialData: jest.requireActual('@/pages/Demo/demoTestStubs')
    .FillCredentialDataStub,
}));
jest.mock('@/components/Steps/CredentialOffer/CredentialOffer', () => ({
  CredentialOffer: jest.requireActual('@/pages/Demo/demoTestStubs')
    .CredentialOfferStub,
}));
jest.mock('@/components/QRCode', () => ({
  QRCode: jest.requireActual('@/components/Steps/VerificationRequest/testUtils')
    .QRCodeStub,
}));

const mdlSchema = {
  id: 'mdl',
  name: 'mDL',
  isHidden: false,
  orderIndex: 0,
  registrations: [],
  fields: [
    { id: 'f-1', name: 'given_name' },
    { id: 'f-2', name: 'family_name' },
    { id: 'f-3', name: 'age_over_18' },
  ],
};

const stubDemoAgency = (
  sharedAttributes: Record<string, string>,
  schema: typeof mdlSchema = mdlSchema,
) => {
  const demoApi = createMockApi();
  demoApi.get.mockImplementation((url: string) => {
    if (url === '/v2/schemas') {
      return Promise.resolve({
        data: {
          items: [{ ...schema, id: 'other', name: 'Other' }, schema],
        },
      });
    }
    if (url === '/openid4vc/verification-session/vs-1') {
      return Promise.resolve({
        data: {
          id: 'vs-1',
          state: OpenIdPresentationState.ResponseVerified,
          sharedAttributes,
        },
      });
    }
    return Promise.resolve({ data: undefined });
  });
  demoApi.post.mockResolvedValue({
    data: {
      authorizationRequest: 'openid4vp://age-request',
      verificationSession: {
        id: 'vs-1',
        state: OpenIdPresentationState.RequestCreated,
      },
    },
  });
  return demoApi;
};

const renderDemo = (demoApi: MockApi) =>
  renderWithProviders(<AgeVerificationDemo />, {
    demoApi,
    route: '/age-demo',
  });

const checkbox = (name: string) =>
  screen
    .getAllByRole('checkbox')
    .find((el) => el.getAttribute('name') === name) as HTMLInputElement;

const ageCheck = () =>
  screen.getByRole('checkbox', { name: 'Verify age (18+)' });

const goToFieldSelection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Issue' }));
  await user.click(screen.getByRole('button', { name: 'Verify Credential' }));
};

describe('AgeVerificationDemo', () => {
  test('explains, instead of loading forever, when the demo has no mDL schema', async () => {
    const demoApi = createMockApi();
    demoApi.get.mockResolvedValue({
      data: { items: [{ ...mdlSchema, id: 'other', name: 'Other' }] },
    });
    renderDemo(demoApi);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'This demo needs the "mDL" schema, which the demo account does not have.',
    );
    expect(screen.queryByText('fill: mDL')).not.toBeInTheDocument();
  });

  test('explains when the demo schemas cannot be loaded', async () => {
    const demoApi = createMockApi();
    demoApi.get.mockRejectedValue({
      response: { status: 503, data: { message: 'Demo unavailable' } },
    });
    renderDemo(demoApi);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The demo schemas could not be loaded. Please try again later.',
    );
  });

  test('prefills the mDL credential and offers it as an mso_mdoc', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency({});
    renderDemo(demoApi);

    expect(screen.getByText('Age Verification Demo')).toBeInTheDocument();
    expect(await screen.findByText('fill: mDL')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
    expect(
      screen.getByText(/values: .*"age_over_18":"true"/),
    ).toBeInTheDocument();
    expect(demoApi.get).toHaveBeenCalledWith('/v2/schemas');

    await user.click(screen.getByRole('button', { name: 'Issue' }));

    expect(screen.getByText('Credential offer')).toBeInTheDocument();
    expect(
      screen.getByText('offer: OpenId4VC/mso_mdoc; demo: true'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('offered: {"firstName":"Alice"}'),
    ).toBeInTheDocument();
  });

  test('requests the chosen fields plus the age check and shows a verified age', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency({ given_name: 'John', age_over_18: 'true' });
    renderDemo(demoApi);

    await goToFieldSelection(user);

    expect(screen.getByText('Request fields verification')).toBeInTheDocument();
    expect(checkbox('given_name')).toBeInTheDocument();
    expect(checkbox('family_name')).toBeInTheDocument();
    expect(checkbox('age_over_18')).toBeUndefined();
    expect(ageCheck()).toBeChecked();

    await user.click(checkbox('given_name'));
    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(await screen.findByTestId('qr')).toHaveTextContent(
      'openid4vp://age-request',
    );
    const [url, body] = demoApi.post.mock.calls[0];
    expect(url).toBe('/openid4vc/verification-session/request');
    expect(JSON.stringify(body)).toContain('given_name');
    expect(JSON.stringify(body)).toContain('age_over_18');
    expect(JSON.stringify(body)).not.toContain('family_name');

    expect(
      await screen.findByText('Credential verified', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Age Verified')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  test('shows its title and yes/no values in the current language', async () => {
    const overrides: Array<[string, string]> = [
      ['AgeVerificationDemo.titles.main', 'Altersprüfung'],
      ['Common.values.no', 'Nein'],
    ];
    const originals = overrides.map(
      ([key]) => [key, i18n.t(key)] as [string, string],
    );
    const apply = (entries: Array<[string, string]>) =>
      entries.forEach(([key, value]) =>
        i18n.addResource('en', 'translation', key, value),
      );
    apply(overrides);
    try {
      const user = userEvent.setup();
      renderDemo(stubDemoAgency({ age_over_18: 'true', organ_donor: 'false' }));

      expect(screen.getByText('Altersprüfung')).toBeInTheDocument();

      await goToFieldSelection(user);
      await user.click(screen.getByRole('button', { name: 'Request' }));

      expect(
        await screen.findByText('Credential verified', {}, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(screen.getByText('Nein')).toBeInTheDocument();
    } finally {
      apply(originals);
    }
  });

  test('starts the demo again from the result', async () => {
    const user = userEvent.setup();
    renderDemo(stubDemoAgency({ age_over_18: 'true' }));

    await goToFieldSelection(user);
    await user.click(screen.getByRole('button', { name: 'Request' }));
    expect(
      await screen.findByText('Credential verified', {}, { timeout: 4000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start again' }));

    // Back at the first step, with the mDL schema and its values prefilled again
    expect(await screen.findByText('fill: mDL')).toBeInTheDocument();
    expect(
      screen.getByText(/values: .*"age_over_18":"true"/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Credential verified')).not.toBeInTheDocument();
  });

  test('flags a holder who is not over 18', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency({ age_over_18: 'false' });
    renderDemo(demoApi);

    await goToFieldSelection(user);
    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(
      await screen.findByText('Age Not Verified', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  test('requires a field when the age check is turned off', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency({});
    renderDemo(demoApi);

    await goToFieldSelection(user);
    await user.click(ageCheck());

    expect(ageCheck()).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Request' })).toBeDisabled();

    await user.click(checkbox('family_name'));
    expect(screen.getByRole('button', { name: 'Request' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Request' }));

    await waitFor(() => expect(demoApi.post).toHaveBeenCalled());
    const body = JSON.stringify(demoApi.post.mock.calls[0][1]);
    expect(body).toContain('family_name');
    expect(body).not.toContain('age_over_18');
  });

  test('labels the age check, which its text toggles', async () => {
    const user = userEvent.setup();
    renderDemo(stubDemoAgency({}));

    await goToFieldSelection(user);
    expect(ageCheck()).toBeChecked();

    await user.click(screen.getByText('Verify age (18+)'));
    expect(ageCheck()).not.toBeChecked();
  });

  test('does not send an empty request when the schema has no age field', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency(
      {},
      {
        ...mdlSchema,
        fields: mdlSchema.fields.filter((f) => f.name !== 'age_over_18'),
      },
    );
    renderDemo(demoApi);

    await goToFieldSelection(user);

    // No age check to make and nothing selected yet
    expect(
      screen.queryByRole('checkbox', { name: 'Verify age (18+)' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request' })).toBeDisabled();

    await user.click(checkbox('given_name'));
    expect(screen.getByRole('button', { name: 'Request' })).toBeEnabled();
  });

  test('can skip issuance and go back from the field selection', async () => {
    const user = userEvent.setup();
    const demoApi = stubDemoAgency({});
    renderDemo(demoApi);

    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Request fields verification')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('fill: mDL')).toBeInTheDocument();
  });
});
