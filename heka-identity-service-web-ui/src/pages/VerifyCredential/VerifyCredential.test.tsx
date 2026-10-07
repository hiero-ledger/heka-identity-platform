import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ROUTES from '@/app/routes/RoutePaths';
import { WizardType } from '@/app/types/WizardContext';
import { LocationDisplay } from '@/pages/VerifyCredential/testUtils';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import VerifyCredential from './VerifyCredential';
import { VerifyCredentialMenu } from './VerifyCredentialMenu/VerifyCredentialMenu';

// The routed pages have their own tests; stand-ins show which one the router picked
jest.mock('./VerificationTemplates/VerificationTemplates', () => ({
  VerificationTemplates: () => <div>templates page</div>,
}));
jest.mock('./VerificationFromTemplate/VerificationFromTemplate', () => ({
  VerificationFromTemplate: () => <div>from template page</div>,
}));
jest.mock('./AdvancedVerification/AdvancedVerification', () => ({
  __esModule: true,
  default: ({ type }: { type: WizardType }) => (
    <div>{`advanced page (${type})`}</div>
  ),
}));

const renderAt = (route: string) =>
  renderWithProviders(
    <>
      <VerifyCredential />
      <LocationDisplay />
    </>,
    { route, path: ROUTES.VERIFY_CREDENTIAL },
  );

describe('VerifyCredential', () => {
  test('shows the menu panel and the templates page', () => {
    renderAt(ROUTES.VERIFY_CREDENTIAL_TEMPLATES);

    expect(screen.getByText('Verify credential')).toBeInTheDocument();
    expect(screen.getAllByText('Templates').length).toBeGreaterThan(0);
    expect(screen.getByText('templates page')).toBeInTheDocument();
  });

  test('shows the advanced verification panel without the menu', () => {
    renderAt(ROUTES.ADVANCED_VERIFICATION);

    expect(screen.getByText('Advanced verification')).toBeInTheDocument();
    expect(screen.queryByText('Verify credential')).not.toBeInTheDocument();
    expect(screen.getByText('advanced page (issue)')).toBeInTheDocument();
  });

  test('routes the template editor', () => {
    renderAt(ROUTES.VERIFY_TEMPLATE);
    expect(screen.getByText('advanced page (template)')).toBeInTheDocument();
  });

  test('has no nested verify-from-template route', () => {
    // The page lives at ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE, routed by the app Router
    renderAt('/verify-credential/verify-from-template');
    expect(screen.queryByText('from template page')).not.toBeInTheDocument();
  });
});

describe('VerifyCredentialMenu', () => {
  test('navigates to the menu entries and reports the click', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    renderWithProviders(
      <>
        <VerifyCredentialMenu onClick={onClick} />
        <LocationDisplay />
      </>,
      { route: ROUTES.ADVANCED_VERIFICATION },
    );

    await user.click(screen.getByText('Templates'));
    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
    );
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Advanced verification'));
    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.ADVANCED_VERIFICATION,
    );
  });
});
