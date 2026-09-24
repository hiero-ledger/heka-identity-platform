import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { contributorSlice } from '@/entities/Contributor/model/contributorSlice';
import { completeGithubOAuth } from '@/entities/User/model/services/completeGithubOAuth';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

/**
 * ContributorGithubCallback
 *
 * Handles the OAuth callback from GitHub specifically for contributor onboarding.
 * This is a SEPARATE route from the regular GithubCallback (/github/callback)
 * which handles the regular user auth flow.
 *
 * This callback:
 *   1. Exchanges the OAuth code for contributor tokens via the contributor endpoint
 *   2. Populates the contributor Redux state with github account info
 *   3. Advances the wizard to Step 1 (Generate GPG Challenge)
 *
 * Route: /contributor/github/callback?code=...&state=...
 */
const ContributorGithubCallback: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      toast.error('GitHub did not return the required OAuth parameters.');
      navigate(ROUTES.CONTRIBUTOR);
      return;
    }

    dispatch(completeGithubOAuth({ code, state }))
      .unwrap()
      .then((result) => {
        // Populate the contributor slice with the GitHub account info
        dispatch(
          contributorSlice.actions.setGithubLinked({
            githubAccountId: result.github.accountId,
            githubUsername: result.github.username,
          }),
        );
        dispatch(contributorSlice.actions.markStepCompleted(0));
        dispatch(contributorSlice.actions.setCurrentStep(1));
        navigate(ROUTES.CONTRIBUTOR_ONBOARDING);
      })
      .catch(() => {
        toast.error('GitHub login failed. Please try again.');
        navigate(ROUTES.CONTRIBUTOR);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dispatch, navigate, searchParams]);

  return (
    <Column alignItems="center" justifyContent="center" style={{ minHeight: '60vh' }}>
      {isLoading && (
        <>
          <Loader size={48} />
          <p style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>
            Completing GitHub login…
          </p>
        </>
      )}
    </Column>
  );
};

export default ContributorGithubCallback;
