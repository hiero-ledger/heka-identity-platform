import { PressEvent } from '@react-types/shared/src/events';
import React from 'react';
import { useTranslation } from 'react-i18next';

import ChevronRightSVG from '@/shared/assets/icons/chevron-right.svg';
import { Button, ButtonIcon } from '@/shared/ui/Button';
import { Row } from '@/shared/ui/Grid';

import * as cls from './ActionButton.module.scss';

interface ActionButtonProps {
  isDisabled?: boolean;
  isSmall?: boolean;
  className?: string;
  leftIcon?: ButtonIcon;
  rightIcon?: ButtonIcon;
  onPress: (e: PressEvent) => void;
  labelKey: string;
}

export const ActionButton = ({
  className,
  isDisabled,
  isSmall,
  leftIcon,
  rightIcon,
  onPress,
  labelKey,
}: ActionButtonProps) => {
  const { t } = useTranslation();

  return (
    <Button
      buttonType="text"
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      isDisabled={isDisabled}
      isSmall={isSmall}
      onPress={onPress}
      className={className}
    >
      <Row
        alignItems="center"
        justifyContent="space-between"
        className={cls.container}
      >
        <span>{t(labelKey)}</span>
        <ChevronRightSVG />
      </Row>
    </Button>
  );
};
