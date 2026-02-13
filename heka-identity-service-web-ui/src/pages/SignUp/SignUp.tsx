import { joiResolver } from '@hookform/resolvers/joi';
import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { getUserIsRegistered } from '@/entities/User/model/selectors/userSelector';
import { signUp } from '@/entities/User/model/services/signUp';
import { useUserActions } from '@/entities/User/model/slices/userSlice';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import * as cls from '@/shared/ui/Form/Form.module.scss';
import { TextInput } from '@/shared/ui/TextInput';

import {
  SignUpFormData,
  SignUpFormSchema,
  SingUpFormDefaultValues,
} from './SignUp.form';

const SignUpView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const isRegistered = useSelector(getUserIsRegistered);
  const { reset: resetUserState } = useUserActions();

  const [isDisabled, setIsDisabled] = useState(true);

  const { handleSubmit, control } = useForm<SignUpFormData>({
    resolver: joiResolver(SignUpFormSchema),
    defaultValues: SingUpFormDefaultValues,
  });

  // This Effect was added because the click on "Create account" button
  // in SignIn form transferring to the submit button and press it on view create
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDisabled(false);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isRegistered) {
      navigate(ROUTES.SIGN_IN);
      dispatch(resetUserState());
    }
  }, [isRegistered, navigate, dispatch, resetUserState]);

  const handleSignUp = useCallback(
    (data: SignUpFormData) => {
      try {
        dispatch(
          signUp({
            name: data.username,
            password: data.password,
          }),
        );
      } catch (e) {
        console.log(e.message);
      }
    },
    [dispatch],
  );

  return (
    <form
      onSubmit={handleSubmit(handleSignUp)}
      className={cls.Form}
    >
      <TextInput
        label={t('SignUp.titles.username')}
        name="username"
        control={control}
      />
      <TextInput
        label={t('SignUp.titles.password')}
        name="password"
        control={control}
        hideText
      />
      <TextInput
        label={t('SignUp.titles.repeatPassword')}
        name="passwordRepeat"
        control={control}
        hideText
      />
      <Button
        isDisabled={isDisabled}
        type="submit"
      >
        {t('SignUp.buttons.createAccount')}
      </Button>
    </form>
  );
};

export default SignUpView;
