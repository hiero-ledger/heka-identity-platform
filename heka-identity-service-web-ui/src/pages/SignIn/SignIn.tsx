import { joiResolver } from '@hookform/resolvers/joi';
import React, { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { Delimiter } from '@/components/Delimiter';
import { getUserIsSignedIn } from '@/entities/User/model/selectors/userSelector';
import { signIn } from '@/entities/User/model/services/signIn';
import { useAppState } from '@/shared/hooks/app-state';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import * as cls from '@/shared/ui/Form/Form.module.scss';
import { TextInput } from '@/shared/ui/TextInput';

import {
  SignInFormData,
  SignInFormSchema,
  SingInFormDefaultValues,
} from './SignIn.form';

const SignInView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const isSignedIn = useSelector(getUserIsSignedIn);

  const { resetApplicationState } = useAppState();

  const { handleSubmit, control } = useForm<SignInFormData>({
    resolver: joiResolver(SignInFormSchema),
    defaultValues: SingInFormDefaultValues,
  });

  useEffect(() => {
    if (isSignedIn) {
      navigate(ROUTES.MAIN);
    }
  }, [isSignedIn, navigate]);

  const handleSignIn = useCallback(
    async (data: SignInFormData) => {
      try {
        await dispatch(
          signIn({
            name: data.username,
            password: data.password,
          }),
        ).unwrap();
        resetApplicationState();
      } catch {
        /* empty */
      }
    },
    [dispatch],
  );

  const handleCreateAccount = useCallback(() => {
    navigate(ROUTES.SIGN_UP);
  }, [navigate]);

  return (
    <form
      onSubmit={handleSubmit(handleSignIn)}
      className={cls.Form}
    >
      <TextInput
        label={t('SignIn.titles.username')}
        name="username"
        control={control}
      />
      <TextInput
        label={t('SignIn.titles.password')}
        name="password"
        control={control}
        hideText
      />
      <Button type="submit">{t('SignIn.buttons.signIn')}</Button>
      {/*<Row justifyContent="flex-start">*/}
      {/*  <Link*/}
      {/*    text={t('SignIn.titles.forgotAccount')}*/}
      {/*    onClick={() => navigate(ROUTES.SIGN_UP)}*/}
      {/*  />*/}
      {/*</Row>*/}
      <Delimiter />
      <Button
        type="button"
        buttonType="tonal"
        onPress={handleCreateAccount}
      >
        {t('SignIn.buttons.createAccount')}
      </Button>
    </form>
  );
};

export default SignInView;
