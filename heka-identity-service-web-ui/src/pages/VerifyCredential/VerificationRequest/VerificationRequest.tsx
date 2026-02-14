import { useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { VerificationRequest as VerificationRequestComponent } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { PresentationRequestStep } from '@/pages/VerifyCredential/VerifyCredential.config';

const VerificationRequest = () => {
  const navigate = useNavigate();

  const { state } = useLocation();
  if (!state?.context) return null;

  return (
    <VerificationRequestComponent
      context={state.context}
      stepDetails={PresentationRequestStep}
      onChangeStep={() => {
        navigate(ROUTES.VERIFY_CREDENTIAL_TEMPLATES);
      }}
    />
  );
};

export default VerificationRequest;
