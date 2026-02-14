import React, { CSSProperties } from 'react';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { classNames } from '@/shared/lib/classNames';
import { Button, ButtonIcon } from '@/shared/ui/Button';

import * as cls from './PopupMenu.module.scss';

type Placement = 'top left' | 'top right' | 'bottom left' | 'bottom right';

export interface PopupMenuItemProps {
  caption: string;
  iconName?: ButtonIcon;
  className?: string;
  onAction?: () => void;
}

export interface PopupMenuProps {
  buttonHint?: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties | undefined;
  popupPlacement?: Placement;
  popupClassName?: string;
  items: PopupMenuItemProps[];
}

export const PopupMenu = ({
  buttonHint,
  buttonClassName,
  buttonStyle,
  popupPlacement = 'top left',
  popupClassName,
  items,
}: PopupMenuProps) => {
  return (
    <MenuTrigger>
      <div title={buttonHint}>
        <Button
          leftIcon="dots"
          buttonType="text"
          alignment="left"
          className={buttonClassName}
          style={buttonStyle}
        />
      </div>
      <Popover
        className={classNames(cls.popover, {}, [popupClassName])}
        placement={popupPlacement}
      >
        <Menu>
          {items.map((i) => (
            <MenuItem
              key={i.caption}
              onAction={i.onAction}
            >
              <Button
                buttonType="text"
                alignment="left"
                leftIcon={i.iconName}
                className={i.className}
                fullWidth
              >
                {i.caption}
              </Button>
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
