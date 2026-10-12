import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { Outlet, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { Logo } from '@/components/Logo';
import {
  DesktopNavigationMenu,
  MobileNavigationMenu,
} from '@/components/NavigationMenu';
import { DesktopView, MobileView } from '@/components/Screen/Screen';
import {
  getUserIsSignedIn,
  getUserName,
} from '@/entities/User/model/selectors/userSelector';
import LogoutSVG from '@/shared/assets/icons/logout.svg';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './AuthenticatedLayout.module.scss';

const AuthenticatedLayout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isSignedIn = useSelector(getUserIsSignedIn);
  const username = useSelector(getUserName);

  const onLogoClick = useCallback(() => {
    navigate(ROUTES.MAIN);
  }, [navigate]);

  const onSignIn = useCallback(() => {
    navigate(ROUTES.SIGN_IN);
  }, [navigate]);

  return (
    <>
      <DesktopView>
        <Row className={cls.AuthenticatedLayout}>
          <Column className={cls.sidebar}>
            <Logo
              label={t('Common.titles.logo')}
              onClick={onLogoClick}
            />
            <DesktopNavigationMenu />
          </Column>
          <div className={cls.contentWrapper}>
            <Column className={cls.content}>
              <Outlet />
            </Column>
          </div>
        </Row>
      </DesktopView>
      <MobileView>
        <Column className={cls.AuthenticatedLayout}>
          <Row
            className={cls.mobileHeader}
            justifyContent="space-between"
            alignItems="center"
          >
            <Logo
              label={t('Common.titles.logo')}
              onClick={onLogoClick}
            />
            {isSignedIn && (
              <Button
                rightIcon="user"
                buttonType="text"
                alignment="left"
                onPress={() => navigate(ROUTES.PROFILE)}
              >
                <span className={cls.profileButton}>{username}</span>
              </Button>
            )}
            {!isSignedIn && (
              <LogoutSVG
                className={cls.icon}
                height={32}
                width={32}
                onClick={onSignIn}
              />
            )}
          </Row>
          <Column className={cls.content}>
            <Outlet />
            <Column className={cls.mobileMenuSeparator}></Column>
          </Column>
          <MobileNavigationMenu />
        </Column>
      </MobileView>
    </>
  );
};

export default AuthenticatedLayout;
