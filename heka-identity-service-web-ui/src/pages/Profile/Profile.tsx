import { useCallback, useEffect, useState } from 'react';
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
import { LogoImageField } from '@/components/LogoImageField';
import { BasicPanel } from '@/components/Panel';
import { TextField, TextFieldFormData } from '@/components/TextField/TextField';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import {
  getIsPreparingUser,
  getUser,
} from '@/entities/User/model/selectors/userSelector';
import { getAgencyUser } from '@/entities/User/model/services/getAgencyUser';
import {
  AgencyUserParams,
  AgencyUserProperty,
  patchAgencyUser,
} from '@/entities/User/model/services/patchAgencyUser';
import { signOut } from '@/entities/User/model/services/signOut';
import { useAuthSession } from '@/shared/auth/session';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

import * as cls from './Profile.module.scss';

const ISSUER_NAME_MAX_LENGTH = 250;

const Profile = () => {
  const user = useSelector(getUser);
  const isPreparingUser = useSelector(getIsPreparingUser);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const session = useAuthSession();

  const [isUserFetching, setIsUserFetching] = useState(true);
  const [firstLoginNotified, setFirstLoginNotified] = useState(false);

  const onSignOut = useCallback(() => {
    dispatch(signOut());
    navigate(ROUTES.SIGN_IN);
  }, [dispatch, navigate]);

  // The password lives at the OpenID Connect provider; the profile decides whether a
  // change flow exists (Keycloak: application-initiated action, Auth0: account page).
  const onChangePassword = useCallback(() => {
    void session.changePassword?.();
  }, [session]);

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
      patchAgencyUserProperty({ key: data.field, value: data.value?.trim() });
    },
    [patchAgencyUserProperty],
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

  // Validates the name as it will be saved, i.e. trimmed: `setValueAs` would never run, because
  // TextInput writes the value through a Controller rather than a registered input
  const issuerNameValidation = {
    validate: (value?: string) => {
      const name = (value ?? '').trim();
      if (!name) return t('Profile.validation.issuerRequired');
      if (name.length > ISSUER_NAME_MAX_LENGTH) {
        return t('Profile.validation.issuerMaxLength', {
          max: ISSUER_NAME_MAX_LENGTH,
        });
      }
      return true;
    },
  };

  return (
    <Row className={cls.ProfileWrapper}>
      <BasicPanel
        title={t('Profile.titles.main')}
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
                  onSubmit={() =>
                    toast.error(t('Common.messages.notImplemented'))
                  }
                  className={
                    session.changePassword
                      ? cls.intermediateField
                      : cls.lastField
                  }
                  alignOnStart={true}
                  isEditDisabled={true}
                ></TextField>
                {session.changePassword && (
                  <Row
                    className={cls.lastField}
                    justifyContent="space-between"
                  >
                    <ActionButton
                      className={cls.actionButton}
                      leftIcon="edit"
                      onPress={onChangePassword}
                      labelKey="Profile.buttons.changePassword"
                    />
                  </Row>
                )}
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
