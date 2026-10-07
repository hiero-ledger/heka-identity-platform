import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import ROUTES from '@/app/routes/RoutePaths';
import { Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import {
  LocationDisplay,
  makeVerificationTemplate,
  readLocationState,
} from '@/pages/VerifyCredential/testUtils';
import {
  createMockApi,
  createTestStore,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import AdvancedVerification from './AdvancedVerification';

// The selection steps have their own tests; here they are reduced to the callbacks the wizard wires up
jest.mock('@/components/Steps', () => {
  const actual = jest.requireActual('@/components/Steps');
  const { makeSchema: mockMakeSchema } = jest.requireActual(
    '@/pages/VerifyCredential/testUtils',
  );
  return {
    ...actual,
    SelectProtocolType: (props: {
      title: string;
      protocolType?: string;
      credentialType?: string;
      onChangeProtocolType: (value: string) => void;
      onChangeCredentialType: (value?: string) => void;
      onNext: () => void;
    }) => (
      <section>
        <h2>{props.title}</h2>
        <p>{`protocol: ${props.protocolType}/${props.credentialType}`}</p>
        <button
          onClick={() => {
            props.onChangeProtocolType('OpenId4VC');
            props.onChangeCredentialType('vc+sd-jwt');
          }}
        >
          Use OpenID
        </button>
        <button onClick={props.onNext}>Next</button>
      </section>
    ),
    SelectNetwork: (props: {
      title: string;
      network?: string;
      didOptional?: boolean;
      onChangeNetwork: (value: string) => void;
      onPrev: () => void;
      onNext: () => void;
    }) => (
      <section>
        <h2>{props.title}</h2>
        <p>{`network: ${props.network}; did optional: ${props.didOptional}`}</p>
        <button onClick={() => props.onChangeNetwork('indy')}>Use indy</button>
        <button onClick={props.onPrev}>Back</button>
        <button onClick={props.onNext}>Next</button>
      </section>
    ),
    SelectSchema: (props: {
      title: string;
      network?: string;
      useForTemplate?: boolean;
      schema?: Schema;
      setSchema: (value: Schema) => void;
      onPrev: () => void;
      onNext: () => void;
    }) => (
      <section>
        <h2>{props.title}</h2>
        <p>{`schema: ${props.schema?.name}; network: ${props.network}; template: ${props.useForTemplate}`}</p>
        <button onClick={() => props.setSchema(mockMakeSchema())}>
          Use Passport
        </button>
        <button onClick={props.onPrev}>Back</button>
        <button onClick={props.onNext}>Next</button>
      </section>
    ),
  };
});

const renderWizard = (
  ui: React.ReactElement = <AdvancedVerification />,
  options: Parameters<typeof renderWithProviders>[1] = {},
) =>
  renderWithProviders(
    <>
      {ui}
      <LocationDisplay />
    </>,
    { route: ROUTES.ADVANCED_VERIFICATION, ...options },
  );

const checkbox = (name: string) =>
  screen
    .getAllByRole('checkbox')
    .find((el) => el.getAttribute('name') === name) as HTMLInputElement;

describe('AdvancedVerification', () => {
  test('resets the templates once when opened', () => {
    const api = createMockApi();
    const store = createTestStore({}, api);
    const dispatch = jest.spyOn(store, 'dispatch');

    renderWithProviders(<AdvancedVerification />, {
      api,
      store,
      route: ROUTES.ADVANCED_VERIFICATION,
    });

    const resets = dispatch.mock.calls.filter(
      ([action]) =>
        (action as { type?: string }).type === 'verificationTemplates/reset',
    );
    expect(resets).toHaveLength(1);
  });

  test('walks an Aries request through every step and opens the verification request', async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('Select protocol type')).toBeInTheDocument();
    expect(
      screen.getByText(
        `protocol: ${ProtocolType.Aries}/${AriesCredentialFormat.AnoncredsIndy}`,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(
      screen.getByText('network: undefined; did optional: true'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use indy' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Select schema')).toBeInTheDocument();
    expect(
      screen.getByText('schema: undefined; network: indy; template: false'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use Passport' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
    expect(screen.getByText('Request fields verification')).toBeInTheDocument();
    await user.click(checkbox('firstName'));
    await user.click(checkbox('age'));
    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.VERIFICATION_REQUEST,
    );
    expect(readLocationState(screen.getByTestId('location-state'))).toEqual({
      context: expect.objectContaining({
        wizardType: 'issue',
        protocolType: ProtocolType.Aries,
        credentialType: AriesCredentialFormat.AnoncredsIndy,
        network: 'indy',
        schema: expect.objectContaining({ id: 'schema-1' }),
        attributes: ['firstName', 'age'],
      }),
    });
  });

  test('navigates back through the steps', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Use Passport' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select schema')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select network')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select protocol type')).toBeInTheDocument();
  });

  test('skips the network step for OpenID4VC', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Use OpenID' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(
      screen.getByText(
        'schema: undefined; network: undefined; template: false',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Select protocol type')).toBeInTheDocument();
    expect(
      screen.getByText(
        `protocol: ${ProtocolType.Oid4vc}/${Openid4CredentialFormat.SdJwt}`,
      ),
    ).toBeInTheDocument();
  });

  test('creates a new verification template in template mode', async () => {
    const user = userEvent.setup();
    renderWizard(<AdvancedVerification type="template" />, {
      route: ROUTES.VERIFY_TEMPLATE,
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText('schema: undefined; network: undefined; template: true'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use Passport' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('New verification template')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request' }),
    ).not.toBeInTheDocument();
  });

  test('loads the template being edited into the wizard', async () => {
    const user = userEvent.setup();
    const template = makeVerificationTemplate({
      protocol: ProtocolType.Oid4vc,
      credentialFormat: Openid4CredentialFormat.SdJwt,
      network: 'key',
      fields: [
        {
          id: 'tf-2',
          schemaFieldId: 'f-2',
          schemaFieldName: 'lastName',
          value: '',
        },
      ],
    });
    const api = createMockApi();
    api.get.mockResolvedValue({ data: template });
    renderWizard(<AdvancedVerification type="template" />, {
      api,
      route: {
        pathname: ROUTES.VERIFY_TEMPLATE,
        state: { context: { templateId: 'tpl-1' } },
      },
    });

    expect(
      await screen.findByText(
        `protocol: ${ProtocolType.Oid4vc}/${Openid4CredentialFormat.SdJwt}`,
      ),
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/verification-templates/tpl-1');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText('schema: Passport; network: undefined; template: true'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Edit verification template')).toBeInTheDocument();
    expect(screen.getByText('Template: KYC check')).toBeInTheDocument();
    await waitFor(() => expect(checkbox('lastName')).toBeChecked());
    expect(checkbox('firstName')).not.toBeChecked();
  });
});
