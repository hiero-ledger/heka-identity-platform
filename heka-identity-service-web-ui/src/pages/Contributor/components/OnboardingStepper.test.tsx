import { render, screen } from '@testing-library/react';

import { OnboardingStepper } from './OnboardingStepper';

describe('OnboardingStepper', () => {
  it('labels the first step Link GitHub and renders four steps', () => {
    render(<OnboardingStepper currentStep={0} completedSteps={[]} />);

    expect(screen.getByText('Link GitHub')).toBeInTheDocument();
    expect(screen.getByText('GPG Challenge')).toBeInTheDocument();
    expect(screen.getByText('Sign & Submit')).toBeInTheDocument();
    expect(screen.getByText('Credential')).toBeInTheDocument();
  });
});
