import { ReactElement, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { DesktopView } from '@/components/Screen/Screen';
import {
  getIsPreparingUser,
  getUserIsSignedIn,
  getUserName,
} from '@/entities/User/model/selectors/userSelector';
import IssueIcon from '@/shared/assets/icons/dashboard-outline.svg';
import DidIcon from '@/shared/assets/icons/key-outline.svg';
import VerifyIcon from '@/shared/assets/icons/verified-outline-rounded.svg';
import WalletIcon from '@/shared/assets/icons/wallet-outline.svg';
import { clickableProps } from '@/shared/lib/a11y/clickable';
import { classNames } from '@/shared/lib/classNames';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import i18next from '@/translations';

import * as cls from './NavigationMenu.module.scss';

const desktopIconProps = {
  height: 25,
  width: 22,
};

interface DesktopMenuItem {
  icon: ReactElement;
  title: string;
  route: string;
  active: Array<string>;
}

/**
 * Whether the current location belongs to a menu item. Patterns are route paths, so a section
 * (`/issue-credential/*`) or a dynamic route (`/dids/:did`) highlights its item too.
 */
const isActive = (active: Array<string>, pathname: string) =>
  active.some((pattern) => matchPath(pattern, pathname) !== null);

const desktopMenuItems: Array<DesktopMenuItem> = [
  {
    icon: <WalletIcon {...desktopIconProps} />,
    title: i18next.t('Demo.titles.main'),
    route: ROUTES.MAIN,
    active: [ROUTES.MAIN, ROUTES.DEMO, ROUTES.AGE_DEMO],
  },
  {
    icon: <DidIcon {...desktopIconProps} />,
    title: i18next.t('Dids.titles.main'),
    route: ROUTES.DIDS,
    active: [ROUTES.DIDS, ROUTES.DID_DETAILS],
  },
  {
    icon: <IssueIcon {...desktopIconProps} />,
    title: i18next.t('IssueCredential.titles.main'),
    route: ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
    active: [
      ROUTES.ISSUE_CREDENTIAL,
      ROUTES.ISSUE_ADVANCED_ISSUE,
      ROUTES.CREDENTIAL_OFFER,
      ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
      ROUTES.ISSUE_CREDENTIAL_SCHEMAS,
      ROUTES.ISSUE_CREDENTIAL_CREDENTIAL_DEFINITIONS,
      ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
    ],
  },
  {
    icon: <VerifyIcon {...desktopIconProps} />,
    title: i18next.t('VerifyCredential.titles.main'),
    route: ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
    active: [
      ROUTES.VERIFY_CREDENTIAL,
      ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
      ROUTES.ADVANCED_VERIFICATION,
      ROUTES.VERIFICATION_REQUEST,
      ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
    ],
  },
];
export const DesktopNavigationMenu = () => {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isSignedIn = useSelector(getUserIsSignedIn);
  const isPreparingUser = useSelector(getIsPreparingUser);
  const username = useSelector(getUserName);

  const onSignIn = useCallback(() => {
    navigate(ROUTES.SIGN_IN);
  }, [navigate]);

  const onNavigate = useCallback(
    (route: string) => {
      if (!isSignedIn && route !== ROUTES.MAIN) {
        navigate(ROUTES.SIGN_IN);
        return;
      }
      navigate(route);
    },
    [isSignedIn, navigate],
  );

  return (
    <Column
      className={cls.DesktopNavigationMenu}
      justifyContent="space-between"
    >
      <Column className={cls.desktopMainMenuWrapper}>
        {desktopMenuItems.map((menuItem) => (
          <Row
            key={menuItem.route}
            alignItems="center"
            className={classNames(cls.desktopMenuItem, {
              [cls.activeItem]: isActive(menuItem.active, pathname),
              [cls.disabled]: isPreparingUser,
            })}
            aria-current={
              isActive(menuItem.active, pathname) ? 'page' : undefined
            }
            {...clickableProps(() => onNavigate(menuItem.route), {
              role: 'link',
              disabled: isPreparingUser,
            })}
          >
            {menuItem.icon}
            {menuItem.title}
          </Row>
        ))}
      </Column>
      <DesktopView>
        {isSignedIn && (
          <Button
            leftIcon="user"
            buttonType="text"
            alignment="left"
            className={cls.desktopMenuItem}
            onPress={() => navigate(ROUTES.PROFILE)}
          >
            <span className={cls.username}>{username}</span>
          </Button>
        )}
        {!isSignedIn && (
          <Button
            buttonType="outlined"
            onPress={onSignIn}
            fullWidth
          >
            {t('SignIn.buttons.signIn')}
          </Button>
        )}
      </DesktopView>
    </Column>
  );
};

const mobileIconProps = {
  height: 24,
  width: 24,
};

const mobileMenuItems: Array<DesktopMenuItem> = [
  {
    icon: <WalletIcon {...mobileIconProps} />,
    title: i18next.t('Demo.titles.main'),
    route: ROUTES.MAIN,
    active: [ROUTES.MAIN, ROUTES.DEMO, ROUTES.AGE_DEMO],
  },
  {
    icon: <DidIcon {...mobileIconProps} />,
    title: i18next.t('Dids.titles.mainMobile'),
    route: ROUTES.DIDS,
    active: [ROUTES.DIDS, ROUTES.DID_DETAILS],
  },
  {
    icon: <IssueIcon {...mobileIconProps} />,
    title: i18next.t('IssueCredential.titles.mainMobile'),
    route: ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
    active: [
      ROUTES.ISSUE_CREDENTIAL,
      ROUTES.ISSUE_ADVANCED_ISSUE,
      ROUTES.CREDENTIAL_OFFER,
      ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
      ROUTES.ISSUE_CREDENTIAL_SCHEMAS,
      ROUTES.ISSUE_CREDENTIAL_CREDENTIAL_DEFINITIONS,
      ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
    ],
  },
  {
    icon: <VerifyIcon {...mobileIconProps} />,
    title: i18next.t('VerifyCredential.titles.mainMobile'),
    route: ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
    active: [
      ROUTES.VERIFY_CREDENTIAL,
      ROUTES.ADVANCED_VERIFICATION,
      ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
      ROUTES.VERIFICATION_REQUEST,
      ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
    ],
  },
];

export const MobileNavigationMenu = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isSignedIn = useSelector(getUserIsSignedIn);
  const isPreparingUser = useSelector(getIsPreparingUser);

  const onNavigate = useCallback(
    (route: string) => {
      if (!isSignedIn && route !== ROUTES.MAIN) {
        navigate(ROUTES.SIGN_IN);
        return;
      }
      navigate(route);
    },
    [isSignedIn, navigate],
  );

  return (
    <Row className={cls.MobileNavigationMenu}>
      <Row
        className={cls.mobileMenuWrapper}
        justifyContent="space-around"
      >
        {mobileMenuItems.map((menuItem) => (
          <Column
            key={menuItem.route}
            justifyContent="center"
            alignItems="center"
            className={classNames(cls.desktopMenuItem, {
              [cls.activeItem]: isActive(menuItem.active, pathname),
              [cls.disabled]: isPreparingUser,
            })}
            aria-current={
              isActive(menuItem.active, pathname) ? 'page' : undefined
            }
            {...clickableProps(() => onNavigate(menuItem.route), {
              role: 'link',
              disabled: isPreparingUser,
            })}
          >
            {menuItem.icon}
            {menuItem.title}
          </Column>
        ))}
      </Row>
    </Row>
  );
};
