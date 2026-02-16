import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { DesktopView, MobileView } from '@/components/Screen/Screen';
import CarIcon from '@/shared/assets/icons/car.svg';
import CredentialsIcon from '@/shared/assets/icons/credentials.svg';
import Right from '@/shared/assets/icons/right-white.svg';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './AdvancedMenuItem.module.scss';

export enum AdvancedMenuIcons {
  Credentials,
  Car,
}

export interface AdvancedMenuItemProps {
  title: string;
  to: string;
  icon?: AdvancedMenuIcons;
  setIsPopupOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const AdvancedMenuItem = ({
  title,
  to,
  icon,
  setIsPopupOpen,
}: AdvancedMenuItemProps) => {
  const navigate = useNavigate();

  const onNavigate = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate],
  );

  const handleClick = useCallback(() => {
    onNavigate(to);
    if (setIsPopupOpen) setIsPopupOpen(false);
  }, [onNavigate, setIsPopupOpen, to]);

  return (
    <Column
      className={cls.AdvancedMenuItem}
      onClick={handleClick}
    >
      <Column className={cls.headerWrapper}>
        <p className={cls.title}>{title}</p>
        <Right className={cls.rightIcon} />
      </Column>
      <Row>
        <DesktopView>
          {icon === AdvancedMenuIcons.Credentials && (
            <CredentialsIcon className={cls.icon} />
          )}
          {icon === AdvancedMenuIcons.Car && <CarIcon className={cls.icon} />}
        </DesktopView>
        <MobileView>
          {icon === AdvancedMenuIcons.Credentials && (
            <CredentialsIcon className={cls.iconMobile} />
          )}
          {icon === AdvancedMenuIcons.Car && (
            <CarIcon className={cls.iconMobile} />
          )}
        </MobileView>
      </Row>
    </Column>
  );
};
