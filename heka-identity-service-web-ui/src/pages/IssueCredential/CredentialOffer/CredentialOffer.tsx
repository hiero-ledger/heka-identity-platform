import { useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { CredentialOffer as CredentialOfferComponent } from '@/components/Steps/CredentialOffer/CredentialOffer';
import { CredentialOfferStep } from '@/pages/IssueCredential/IssueCredential.config';

const CredentialOffer = () => {
  const navigate = useNavigate();

  const { state } = useLocation();
  if (!state?.context) return null;

  return (
    <CredentialOfferComponent
      context={state.context}
      stepDetails={CredentialOfferStep}
      onChangeStep={() => {
        navigate(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);
      }}
    />
  );
};

export default CredentialOffer;
