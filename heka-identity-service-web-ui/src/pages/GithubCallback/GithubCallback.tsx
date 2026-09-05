import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { completeGithubOAuth } from '@/entities/User/model/services/completeGithubOAuth';
import { useAppState } from '@/shared/hooks/app-state';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

const GithubCallback = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetApplicationState } = useAppState();
  const [isLoading, setIsLoading] = useState(true);
  const hasStartedOAuthExchange = useRef(false);

  useEffect(() => {
    if (hasStartedOAuthExchange.current) {
      return;
    }

    hasStartedOAuthExchange.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      toast.error('GitHub login did not return the required OAuth parameters.');
      navigate(ROUTES.SIGN_IN);
      return;
    }

    dispatch(completeGithubOAuth({ code, state }))
      .unwrap()
      .then((result) => {
        resetApplicationState();
        navigate(result.redirectPath ?? ROUTES.PROFILE);
      })
      .catch(() => {
        toast.error('GitHub login failed. Please try again.');
        navigate(ROUTES.SIGN_IN);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dispatch, navigate, resetApplicationState, searchParams]);

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
