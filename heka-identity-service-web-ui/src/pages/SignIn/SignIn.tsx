import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { Delimiter } from '@/components/Delimiter';
import { getUserIsSignedIn } from '@/entities/User/model/selectors/userSelector';
import { useAuthSession } from '@/shared/auth/session';
import { Button } from '@/shared/ui/Button';
import * as cls from '@/shared/ui/Form/Form.module.scss';

/**
 * Sign-in is delegated to the OpenID Connect provider (Authorization Code + PKCE): the page
 * only starts the redirect. Registration is offered when the provider profile supports it.
 */
const SignInView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSignedIn = useSelector(getUserIsSignedIn);
  const session = useAuthSession();

  useEffect(() => {
    if (isSignedIn) {
      navigate(ROUTES.MAIN);
    }
  }, [isSignedIn, navigate]);

  const handleSignIn = useCallback(() => {
    void session.signIn();
  }, [session]);

  const handleCreateAccount = useCallback(() => {
    void session.signUp?.();
  }, [session]);

  return (
    <div className={cls.Form}>
      <p>{t('SignIn.titles.providerNote')}</p>
      {session.error && <p role="alert">{session.error}</p>}
      <Button
        type="button"
        onPress={handleSignIn}
      >
        {t('SignIn.buttons.signIn')}
      </Button>
      {session.signUp && (
        <>
          <Delimiter />
          <Button
            type="button"
            buttonType="tonal"
            onPress={handleCreateAccount}
          >
            {t('SignIn.buttons.createAccount')}
          </Button>
        </>
      )}
    </div>
  );
};

export default SignInView;
