import React, { useCallback, useEffect, useState } from 'react';
import { Label } from 'react-aria-components';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { ActionButton } from '@/components/ActionButton';
import {
  BackgroundColorFormData,
  BackgroundColorModalField,
} from '@/components/BackgroundColorModalField';
import { ChangePasswordField } from '@/components/ChangePasswordField/ChangePasswordField';
import { ChangePasswordFieldFormData } from '@/components/ChangePasswordField/ChangePasswordField.form';
import { LogoImageField } from '@/components/LogoImageField';
import { BasicPanel } from '@/components/Panel';
import { TextField, TextFieldFormData } from '@/components/TextField/TextField';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import {
  getIsPreparingUser,
  getUser,
} from '@/entities/User/model/selectors/userSelector';
import { changePassword } from '@/entities/User/model/services/changePassword';
import { getAgencyUser } from '@/entities/User/model/services/getAgencyUser';
import {
  AgencyUserParams,
  AgencyUserProperty,
  patchAgencyUser,
} from '@/entities/User/model/services/patchAgencyUser';
import { signOut } from '@/entities/User/model/services/signOut';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

import * as cls from './Profile.module.scss';

const Profile = () => {
  const user = useSelector(getUser);
  const isPreparingUser = useSelector(getIsPreparingUser);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
  const [isUserFetching, setIsUserFetching] = useState(true);
  const [firstLoginNotified, setFirstLoginNotified] = useState(false);

  const onSignOut = useCallback(() => {
    dispatch(signOut());
    navigate(ROUTES.SIGN_IN);
  }, [dispatch, navigate]);

  const patchAgencyUserProperty = useCallback(
    ({ key, value }: AgencyUserProperty) => {
      const params: AgencyUserParams = {};
      if (key) {
        params[key] = value;
      }
      dispatch(patchAgencyUser(params));
    },
    [dispatch],
  );

  const handleUpdateAgencyUser = useCallback(
    (data: TextFieldFormData) => {
      patchAgencyUserProperty({ key: data.field, value: data.value });
    },
    [patchAgencyUserProperty],
  );

  const handlerPasswordChange = useCallback(
    (data: ChangePasswordFieldFormData) => {
      dispatch(changePassword({ ...data, username: user?.name ?? '' })).then(
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => {
          if (o && !o.error) {
            setIsPasswordFormOpen(false);
            toast.success(t('Profile.titles.passwordChanged'));
          }
        },
      );
    },
    [dispatch, t, user?.name],
  );

  const onColorChange = (data: BackgroundColorFormData) => {
    patchAgencyUserProperty({ key: 'backgroundColor', value: data.color });
  };
  const onLogoChange = (logo: File | string) => {
    patchAgencyUserProperty({ key: 'logo', value: logo });
  };

  useEffect(() => {
    if (!isPreparingUser) {
      dispatch(getAgencyUser()).then(() => {
        setIsUserFetching(false);
      });
    }
  }, [dispatch, isPreparingUser]);

  useEffect(() => {
    if (!firstLoginNotified && !isUserFetching && user && !user.registeredAt) {
      toast.success(t('Profile.titles.firstSignIn'), { duration: 5000 });
      setFirstLoginNotified(true);
    }
  }, [t, user, isUserFetching, firstLoginNotified]);

  const issuerNameValidation = {
    setValueAs: (value: string) => value.trim(),
    required: {
      value: true,
      message: 'Issuer is required',
    },
    maxLength: {
      value: 250,
      message: 'Maximum length is 250',
    },
  };

  return (
    <Row className={cls.ProfileWrapper}>
      <BasicPanel
        title="Profile"
        icon={'vault'}
      />
      <Row
        className={cls.Profile}
        justifyContent="center"
        alignItems="center"
      >
        <Column
          alignItems="center"
          className={cls.contentWrapper}
        >
          <Column
            justifyContent="flex-start"
            className={cls.stepWrapper}
          >
            <Column className={cls.group}>
              <Column className={cls.topFieldsWrapper}>
                <TextField
                  labelKey="Profile.titles.name"
                  field="username"
                  value={user?.name ?? ''}
                  onSubmit={() => toast.error('Not implemented yet')}
                  className={cls.intermediateField}
                  alignOnStart={true}
                  isEditDisabled={true}
                ></TextField>
                <ChangePasswordField
                  isModalOpen={isPasswordFormOpen}
                  setIsModalOpen={setIsPasswordFormOpen}
                  onSubmit={handlerPasswordChange}
                  className={cls.lastField}
                  alignOnStart={true}
                />
              </Column>
            </Column>

            <Column className={cls.group}>
              {isPreparingUser && (
                <Row
                  className={cls.topFieldsWrapper}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Label>{t('Profile.titles.preparation')}</Label>
                  <Loader size={48} />
                </Row>
              )}
              {!isPreparingUser && (
                <Column className={cls.topFieldsWrapper}>
                  <TextField
                    alignOnStart={true}
                    isLoading={isUserFetching}
                    labelKey="Profile.titles.issuer"
                    field="name"
                    value={user?.issuerName ?? ''}
                    onSubmit={handleUpdateAgencyUser}
                    className={cls.intermediateField}
                    fieldValidator={issuerNameValidation}
                  ></TextField>
                  <LogoImageField
                    alignOnStart={true}
                    isLoading={isUserFetching}
                    altI18nKey="Common.imageAlts.issuerLogo"
                    currentImageSrc={user?.logo}
                    file={user?.logo ?? defaultLogoImagePath}
                    selectFile={onLogoChange}
                    className={cls.intermediateField}
                  />
                  <BackgroundColorModalField
                    color={
                      user?.backgroundColor ?? defaultSchemaBackgroundColor
                    }
                    submitColor={onColorChange}
                    isLoading={isUserFetching}
                    alignOnStart={true}
                    className={cls.lastField}
                  />
                </Column>
              )}
            </Column>
            <Column className={cls.group}>
              <Column className={cls.topFieldsWrapper}>
                <Row justifyContent="space-between">
                  <ActionButton
                    className={cls.actionButton}
                    leftIcon="logout"
                    onPress={onSignOut}
                    labelKey="SignIn.buttons.signOut"
                  />
                </Row>
              </Column>
            </Column>
          </Column>
        </Column>
      </Row>
    </Row>
  );
};

export default Profile;
