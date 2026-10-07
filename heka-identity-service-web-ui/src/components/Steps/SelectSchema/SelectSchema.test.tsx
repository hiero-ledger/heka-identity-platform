import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ProtocolType, Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
} from '@/entities/Schema/model/types/schema';
import {
  registeredSchema,
  routeAgencyGets,
  unregisteredSchema,
} from '@/pages/IssueCredential/testUtils';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { SelectSchema } from './SelectSchema';
import { formatSchemaAttributes } from './SelectSchema.helper';

jest.mock('@/components/CreateSchema/CreateSchema', () => ({
  CreateSchemaModal: () => null,
}));

let mockIsMobile = false;
jest.mock('@/components/Screen/Screen', () => ({
  ...jest.requireActual('@/components/Screen/Screen'),
  useMobile: () => mockIsMobile,
}));

type SelectSchemaHarnessProps = Partial<
  React.ComponentProps<typeof SelectSchema>
>;

// Holds the selected schema the way the wizards do
const Harness = (props: SelectSchemaHarnessProps) => {
  const [schema, setSchema] = useState<Schema | undefined>();
  return (
    <SelectSchema
      title="Select schema"
      schema={schema}
      setSchema={setSchema}
      onNext={jest.fn()}
      {...props}
    />
  );
};

const schemaListGets = (api: ReturnType<typeof createMockApi>) =>
  api.get.mock.calls.filter(([url]) => url === '/v2/schemas');

describe('SelectSchema', () => {
  afterEach(() => {
    mockIsMobile = false;
  });

  test('offers the schemas in a dropdown on mobile', async () => {
    mockIsMobile = true;
    const api = createMockApi();
    routeAgencyGets(api);
    const user = userEvent.setup();

    renderWithProviders(<Harness />, { api });
    expect(await screen.findByText('firstName')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Passport/ }));
    await user.click(await screen.findByRole('option', { name: 'Diploma' }));

    expect(await screen.findByText('degree')).toBeInTheDocument();
  });

  test('loads the demo schemas from the demo agency', async () => {
    const api = createMockApi();
    const demoApi = createMockApi();
    routeAgencyGets(demoApi);

    renderWithProviders(<Harness useDemo />, { api, demoApi });

    expect(await screen.findByText('firstName')).toBeInTheDocument();
    expect(schemaListGets(demoApi)).toHaveLength(1);
    expect(schemaListGets(api)).toHaveLength(0);
    // Without onPrev there is no way back
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  });

  test('shows the issuer of the selected schema', async () => {
    const api = createMockApi();
    routeAgencyGets(api, {
      schemas: [{ ...registeredSchema, issuerName: 'Gov', logo: '/gov.png' }],
    });

    renderWithProviders(<Harness />, { api });

    expect(await screen.findByText('Issued by Gov')).toBeInTheDocument();
    expect(screen.getByAltText('schema logo')).toHaveAttribute(
      'src',
      '/gov.png',
    );
  });

  test('blocks verification with a schema that is not registered for the target', async () => {
    const api = createMockApi();
    routeAgencyGets(api, { schemas: [unregisteredSchema, registeredSchema] });
    const onNext = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Harness
        useForVerification
        protocol={ProtocolType.Aries}
        credentialType={AriesCredentialFormat.AnoncredsIndy}
        network="indy"
        onNext={onNext}
      />,
      { api },
    );

    expect(
      await screen.findByText(
        /The schema is not yet registered\. For verification/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();

    await user.click(screen.getByTitle('Passport'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled(),
    );
    expect(screen.queryByText(/The schema is not yet registered/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onNext).toHaveBeenCalled();
  });

  test('uses the template wording for verification templates', async () => {
    const api = createMockApi();
    routeAgencyGets(api, { schemas: [registeredSchema] });

    renderWithProviders(
      <Harness
        useForVerification
        useForTemplate
        protocol={ProtocolType.Oid4vc}
        credentialType={Openid4CredentialFormat.SdJwt}
      />,
      { api },
    );

    expect(
      await screen.findByText(/For create verification template/),
    ).toBeInTheDocument();
  });
});

describe('formatSchemaAttributes', () => {
  test('replaces the fields with their names', () => {
    expect(formatSchemaAttributes(registeredSchema)).toEqual(
      expect.objectContaining({
        id: registeredSchema.id,
        attributes: ['firstName', 'lastName'],
      }),
    );
    expect(formatSchemaAttributes({ id: 'x' } as Schema).attributes).toEqual(
      [],
    );
  });
});
