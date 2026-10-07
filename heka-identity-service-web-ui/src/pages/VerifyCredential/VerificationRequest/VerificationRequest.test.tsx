import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ROUTES from '@/app/routes/RoutePaths';
import { NextStepName } from '@/components/Steps/Step.types';
import { PresentationRequestContext } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { LocationDisplay } from '@/pages/VerifyCredential/testUtils';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import VerificationRequest from './VerificationRequest';

jest.mock('@/components/Steps/VerificationRequest/VerificationRequest', () => ({
  VerificationRequest: ({
    context,
    stepDetails,
    onChangeStep,
  }: {
    context: PresentationRequestContext;
    stepDetails: { title: string };
    onChangeStep: (step?: NextStepName<object>) => void;
  }) => (
    <section>
      <h2>{stepDetails.title}</h2>
      <p>{`protocol: ${context.protocolType}`}</p>
      <button onClick={() => onChangeStep()}>Verify more</button>
    </section>
  ),
}));

describe('VerificationRequest page', () => {
  test('renders nothing without a context', () => {
    const { container } = renderWithProviders(<VerificationRequest />, {
      route: ROUTES.VERIFICATION_REQUEST,
    });

    expect(container).toBeEmptyDOMElement();
  });

  test('shows the request for the routed context and returns to the templates', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <VerificationRequest />
        <LocationDisplay />
      </>,
      {
        route: {
          pathname: ROUTES.VERIFICATION_REQUEST,
          state: { context: { protocolType: ProtocolType.Aries } },
        },
      },
    );

    expect(screen.getByText('Presentation Request')).toBeInTheDocument();
    expect(screen.getByText('protocol: Aries')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Verify more' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
    );
  });
});
