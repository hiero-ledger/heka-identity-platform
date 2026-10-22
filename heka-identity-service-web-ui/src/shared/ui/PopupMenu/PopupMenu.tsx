import { CSSProperties } from 'react';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { classNames } from '@/shared/lib/classNames';
import {
  Button,
  buttonClassName as buttonClass,
  ButtonIcon,
  ButtonIconGlyph,
} from '@/shared/ui/Button';

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
          aria-label={buttonHint}
        />
      </div>
      <Popover
        className={classNames(cls.popover, {}, [popupClassName])}
        placement={popupPlacement}
      >
        <Menu aria-label={buttonHint}>
          {items.map((i) => (
            // The menu item itself is the interactive element (no nested button), styled as one
            <MenuItem
              key={i.caption}
              textValue={i.caption}
              onAction={i.onAction}
              className={buttonClass({
                buttonType: 'text',
                alignment: 'left',
                fullWidth: true,
                className: i.className,
              })}
            >
              {i.iconName && <ButtonIconGlyph name={i.iconName} />}
              {i.caption}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
