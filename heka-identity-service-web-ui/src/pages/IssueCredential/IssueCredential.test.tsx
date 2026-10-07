import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ROUTES from '@/app/routes/RoutePaths';
import { ProtocolType } from '@/entities/Schema';
import { AriesCredentialFormat } from '@/entities/Schema/model/types/schema';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import IssueCredential from './IssueCredential';
import {
  IssueCredentialContext,
  IssueCredentialSteps,
  steps,
} from './IssueCredential.config';
import { IssueCredentialMenu } from './IssueCredentialMenu/IssueCredentialMenu';
import {
  INDY_DID,
  LocationProbe,
  registeredSchema,
  routeAgencyGets,
  unregisteredSchema,
} from './testUtils';

jest.mock('@/components/CreateSchema/CreateSchema', () => ({
  CreateSchemaModal: () => null,
}));

const renderAt = (pathname: string) => {
  const api = createMockApi();
  routeAgencyGets(api);
  const result = renderWithProviders(
    <>
      <IssueCredential />
      <LocationProbe />
    </>,
    { api, route: pathname, path: '/issue-credential/*' },
  );
  return { ...result, user: userEvent.setup() };
};

describe('IssueCredential page', () => {
  test('shows the issuance templates with the active menu item', async () => {
    renderAt(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);

    expect(screen.getByText('Issue credential')).toBeInTheDocument();
    expect(await screen.findByText('My passport template')).toBeInTheDocument();
    expect(screen.getByText('Advanced issue')).toBeInTheDocument();
  });

  test('navigates between sections from the menu', async () => {
    const { user } = renderAt(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);

    // The schemes menu item; the page header also shows the active item
    const [schemesItem] = screen.getAllByText('Schemas');
    await user.click(schemesItem);
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      ROUTES.ISSUE_CREDENTIAL_SCHEMAS,
    );
    expect(await screen.findByTitle('Passport')).toBeInTheDocument();

    await user.click(screen.getByText('Advanced issue'));
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      ROUTES.ISSUE_ADVANCED_ISSUE,
    );
  });

  test('advanced issue shows its own panel and the wizard', async () => {
    renderAt(ROUTES.ISSUE_ADVANCED_ISSUE);

    expect(screen.getByText('Advanced issue')).toBeInTheDocument();
    expect(screen.queryByText('Issue credential')).toBeNull();
    expect(await screen.findByText('Select protocol type')).toBeInTheDocument();
  });

  test('template route opens the wizard in template mode', async () => {
    renderAt(ROUTES.ISSUE_TEMPLATE);
    expect(await screen.findByText('Select protocol type')).toBeInTheDocument();
  });

  test('issue from template route loads the template from the route state', async () => {
    const api = createMockApi();
    routeAgencyGets(api);
    renderWithProviders(<IssueCredential />, {
      api,
      path: '/issue-credential/*',
      route: {
        pathname: '/issue-credential/issue-from-template',
        state: { context: { templateId: 'template-1' } },
      },
    });

    expect(
      await screen.findByText('Template: My passport template'),
    ).toBeInTheDocument();
  });

  test.each([
    ['credential-definitions', 'Credential definitions'],
    ['dids', 'DIDs'],
    ['issued-credentials', 'Issued credentials'],
  ])('renders the %s placeholder', (segment, text) => {
    renderAt(`/issue-credential/${segment}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('IssueCredential config', () => {
  const schemaStep = steps.find(
    (s) => s.name === IssueCredentialSteps.SelectSchema,
  )!;
  const nextAfterSchema = schemaStep.next!.name as (
    context?: IssueCredentialContext,
  ) => string;
  const context: IssueCredentialContext = {
    wizardType: 'issue',
    protocolType: ProtocolType.Aries,
    credentialType: AriesCredentialFormat.AnoncredsIndy,
    network: 'indy',
    did: INDY_DID,
  };

  test('skips registration when the schema is registered for the target', () => {
    expect(nextAfterSchema({ ...context, schema: registeredSchema })).toBe(
      IssueCredentialSteps.IssueNewCredential,
    );
  });

  test('requires registration when the schema is not registered', () => {
    expect(nextAfterSchema({ ...context, schema: unregisteredSchema })).toBe(
      IssueCredentialSteps.SchemaRegistration,
    );
  });
});

describe('IssueCredentialMenu', () => {
  test('notifies the caller after navigating, e.g. to close a popup', async () => {
    const onClick = jest.fn();
    renderWithProviders(
      <>
        <IssueCredentialMenu onClick={onClick} />
        <LocationProbe />
      </>,
      { route: ROUTES.ISSUE_CREDENTIAL_SCHEMAS },
    );

    await userEvent.setup().click(screen.getByText('Templates'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pathname')).toHaveTextContent(
      ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
    );
  });
});
