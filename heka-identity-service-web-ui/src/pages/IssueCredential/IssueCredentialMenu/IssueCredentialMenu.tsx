import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import {
  AdvancedMenuIcons,
  AdvancedMenuItem,
} from '@/components/Panel/shared/AdvancedMenuItem';
import { panelIssuanceMenuItems } from '@/entities/User/model/const';
import { getIsPreparingUser } from '@/entities/User/model/selectors/userSelector';
import { classNames } from '@/shared/lib/classNames';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './IssueCredentialMenu.module.scss';

export interface IssueCredentialMenuProps {
  onClick?: () => void;
}

export const IssueCredentialMenu = ({ onClick }: IssueCredentialMenuProps) => {
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
      {panelIssuanceMenuItems.length !== 0 && (
        <Column className={cls.panelMenuItemsWrapper}>
          {panelIssuanceMenuItems.map((menuItem) => (
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
        title={t('IssueCredential.menuItemNames.advancedIssue')}
        to={ROUTES.ISSUE_ADVANCED_ISSUE}
        icon={AdvancedMenuIcons.Credentials}
      />
    </>
  );
};
