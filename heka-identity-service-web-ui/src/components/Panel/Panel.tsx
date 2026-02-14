import React, { useState } from 'react';

import IconCar from '@/shared/assets/icons/car.svg';
import IconCredentials from '@/shared/assets/icons/credentials.svg';
import DropDown from '@/shared/assets/icons/drop_down.svg';
import IconVault from '@/shared/assets/icons/vault-new.svg';
import IconWallet from '@/shared/assets/icons/wallet-new.svg';
import { Column, Row } from '@/shared/ui/Grid';
import { getTextColor } from '@/shared/utils/colors';

import { DesktopView, MobileView } from '../Screen/Screen';

import * as cls from './Panel.module.scss';

const desktopIconProps = {
  height: 360,
  width: 340,
};

const mobileIconProps = {
  height: 140,
  width: 160,
};

type PanelIcon = 'car' | 'documents' | 'wallet' | 'vault';

export interface BasicPanelProps {
  title: string;
  icon?: PanelIcon;
}

export const BasicPanel = ({ title, icon }: BasicPanelProps) => {
  const titleWidth = icon ? '50%' : '100%';

  return (
    <Column className={cls.LeftPanel}>
      <p
        className={cls.titleWrapper}
        style={{ maxWidth: titleWidth }}
      >
        {title}
      </p>

      <MobileView>
        {icon === 'wallet' && (
          <IconWallet
            className={cls.iconWallet}
            {...mobileIconProps}
          />
        )}
        {icon === 'car' && (
          <IconCar
            className={cls.iconCar}
            {...mobileIconProps}
          />
        )}
        {icon === 'vault' && (
          <IconVault
            className={cls.iconVault}
            {...mobileIconProps}
          />
        )}
      </MobileView>

      <DesktopView>
        <Column
          justifyContent="space-between"
          className={cls.desktopPanelMenuWrapper}
        >
          {icon === 'wallet' && (
            <IconWallet
              className={cls.iconWallet}
              {...desktopIconProps}
            />
          )}
          {icon === 'car' && (
            <IconCar
              className={cls.iconCar}
              {...desktopIconProps}
            />
          )}
          {icon === 'vault' && (
            <IconVault
              className={cls.iconVault}
              {...desktopIconProps}
            />
          )}
          {icon === 'documents' && (
            <IconCredentials
              className={cls.iconDocuments}
              {...desktopIconProps}
            />
          )}
        </Column>
      </DesktopView>
    </Column>
  );
};

export const TopPanel = ({ title, icon }: BasicPanelProps) => {
  return (
    <Row
      className={cls.TopPanel}
      justifyContent="space-between"
    >
      <p>{title}</p>
      {icon === 'wallet' && <IconWallet {...mobileIconProps} />}
      {icon === 'documents' && <IconCredentials {...mobileIconProps} />}
      {icon === 'car' && <IconCar {...mobileIconProps} />}
      {icon === 'vault' && <IconVault {...mobileIconProps} />}
    </Row>
  );
};

export interface PanelContextMenuProps {
  panelMenu: React.ReactNode;
  onClick: () => void;
}

export const PanelContextMenu = ({
  panelMenu,
  onClick,
}: PanelContextMenuProps) => {
  return (
    <div className={cls.dialogWrapper}>
      <div
        className={cls.shadowBackground}
        onClick={onClick}
      />

      <Column
        className={cls.modalContent}
        alignItems="flex-start"
        onClick={onClick}
      >
        {panelMenu}
      </Column>
    </div>
  );
};

export interface PanelWithMenuProps {
  title: string;
  activeItem?: string;
  panelMenu: React.ReactNode;
}

export const PanelWithMenu = ({
  title,
  panelMenu,
  activeItem,
}: PanelWithMenuProps) => {
  const [isMenuPopupOpen, setIsMenuPopupOpen] = useState(false);

  const handleToggleModal = () => {
    setIsMenuPopupOpen((prev: boolean) => !prev);
  };

  return (
    <Column className={cls.LeftPanel}>
      <p
        className={cls.titleWrapper}
      >
        {title}
      </p>

      <MobileView>
        <Row
          alignItems="center"
          justifyContent="center"
          className={cls.dropDown}
          onClick={handleToggleModal}
        >
          {activeItem}
          <DropDown />
        </Row>
        {isMenuPopupOpen && (
          <PanelContextMenu
            panelMenu={panelMenu}
            onClick={() => setIsMenuPopupOpen(false)}
          />
        )}
      </MobileView>

      <DesktopView>
        <Column
          justifyContent="space-between"
          className={cls.desktopPanelMenuWrapper}
        >
          {panelMenu}
        </Column>
      </DesktopView>
    </Column>
  );
};

interface ColorizedPanelProps {
  title: string;
  backgroundColor: string;
  logo: string;
}

export const ColorizedPanel = ({
  title,
  logo,
  backgroundColor,
}: ColorizedPanelProps) => {
  const titleTextColor = getTextColor(backgroundColor);

  return (
    <Column
      className={cls.CustomPanel}
      style={{ backgroundColor: backgroundColor }}
      bordered={true}
    >
      <Column
        className={cls.PanelLogoWrapper}
        bordered={true}
      >
        <img
          className={cls.PanelLogo}
          src={logo}
          alt={title}
        />
      </Column>

      <h3 style={{ color: titleTextColor }}>{title}</h3>
    </Column>
  );
};
