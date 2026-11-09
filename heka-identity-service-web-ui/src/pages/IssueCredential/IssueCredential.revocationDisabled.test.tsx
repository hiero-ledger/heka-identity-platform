import { screen } from '@testing-library/react';

import ROUTES from '@/app/routes/RoutePaths';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import IssueCredential from './IssueCredential';
import { routeAgencyGets } from './testUtils';

// A build with REACT_APP_FEATURE_REVOCATION=false (jest.mock applies to the whole file)
jest.mock('@/shared/config/features', () => ({
  features: { revocation: false },
}));

jest.mock('@/components/CreateSchema/CreateSchema', () => ({
  CreateSchemaModal: () => null,
}));

const renderAt = (pathname: string) => {
  const api = createMockApi();
  routeAgencyGets(api);
  renderWithProviders(
    <>
      <IssueCredential />
      <LocationDisplay />
    </>,
    { api, route: pathname, path: '/issue-credential/*' },
  );
  return api;
};

describe('IssueCredential with revocation disabled', () => {
  test('the menu has no Issued credentials item', async () => {
    renderAt(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);

    expect(await screen.findByText('My passport template')).toBeInTheDocument();
    expect(screen.getAllByText('Templates').length).toBeGreaterThan(0);
    expect(screen.queryByText('Issued credentials')).not.toBeInTheDocument();
  });

  test('the issued credentials page is not rendered and loads nothing', () => {
    const api = renderAt(ROUTES.ISSUE_CREDENTIAL_ISSUED_CREDENTIALS);

    expect(screen.queryByText('Issued credentials')).not.toBeInTheDocument();
    expect(screen.queryByText('No issued credentials yet')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/credentials', expect.anything());
  });
});
