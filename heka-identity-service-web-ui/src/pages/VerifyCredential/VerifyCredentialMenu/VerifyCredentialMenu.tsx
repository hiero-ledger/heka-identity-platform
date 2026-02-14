import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import {
  AdvancedMenuIcons,
  AdvancedMenuItem,
} from '@/components/Panel/shared/AdvancedMenuItem';
import { panelVerificationMenuItems } from '@/entities/User/model/const';
import { getIsPreparingUser } from '@/entities/User/model/selectors/userSelector';
import * as cls from '@/pages/IssueCredential/IssueCredentialMenu/IssueCredentialMenu.module.scss';
import { classNames } from '@/shared/lib/classNames';
import { Column, Row } from '@/shared/ui/Grid';

export interface VerifyCredentialMenuProps {
  onClick?: () => void;
}

export const VerifyCredentialMenu = ({
  onClick,
}: VerifyCredentialMenuProps) => {
  const { t } = useTranslation();

  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPreparingUser = useSelector(getIsPreparingUser);

  const onNavigate = useCallback(
    (route: string) => {
      navigate(route);
      if (onClick) onClick();
    },
    [navigate, onClick],
  );

  return (
    <>
      {panelVerificationMenuItems.length !== 0 && (
        <Column className={cls.panelMenuItemsWrapper}>
          {panelVerificationMenuItems.map((menuItem) => (
            <Row
              key={menuItem.route}
              alignItems="center"
              className={classNames(cls.desktopPanelMenuItem, {
                [cls.activeItem]: pathname === menuItem.route,
                [cls.disabled]: isPreparingUser,
              })}
              onClick={() => onNavigate(menuItem.route)}
            >
              {menuItem.title}
            </Row>
          ))}
        </Column>
      )}
      <AdvancedMenuItem
        title={t('VerifyCredential.menuItemNames.advancedVerification')}
        to={ROUTES.ADVANCED_VERIFICATION}
        icon={AdvancedMenuIcons.Car}
      />
    </>
  );
};
