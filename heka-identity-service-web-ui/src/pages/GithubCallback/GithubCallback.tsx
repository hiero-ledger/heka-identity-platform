import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { completeGithubLink } from '@/entities/User/model/services/completeGithubLink';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

const GithubCallback = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const hasStartedLink = useRef(false);

  useEffect(() => {
    if (hasStartedLink.current) {
      return;
    }

    hasStartedLink.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError || !code || !state) {
      toast.error(
        'GitHub did not return the parameters needed to link the account.',
      );
      navigate(ROUTES.CONTRIBUTOR);
      return;
    }

    dispatch(completeGithubLink({ code, state }))
      .unwrap()
      .then((result) => {
        toast.success(`Linked GitHub account @${result.githubUsername}.`);
        navigate(ROUTES.CONTRIBUTOR_ONBOARDING);
      })
      .catch(() => {
        toast.error('GitHub account linking failed. Please try again.');
        navigate(ROUTES.CONTRIBUTOR);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dispatch, navigate, searchParams]);

  return (
    <Column
      alignItems="center"
      justifyContent="center"
    >
      {isLoading && <Loader size={48} />}
    </Column>
  );
};

export default GithubCallback;
