import { PressEvent } from '@react-types/shared/src/events';
import React from 'react';
import { Button } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import ChevronRightSVG from '@/shared/assets/icons/chevron-right.svg';
import { classNames } from '@/shared/lib/classNames';
import { Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

import * as cls from './EditField.module.scss';

interface EditFieldProps {
  labelKey: string;
  className?: string;
  alignOnStart?: boolean;
  children: React.ReactNode;
  onPress?: (e: PressEvent) => void;
  isLoading?: boolean;
  isEditDisabled?: boolean;
}

export const EditField = ({
  labelKey,
  alignOnStart,
  children,
  className,
  onPress,
  isLoading,
  isEditDisabled,
}: EditFieldProps) => {
  const { t } = useTranslation();
  return (
    <Button
      className={classNames(cls.EditField, {}, [className])}
      onPress={onPress}
      isDisabled={isLoading ?? isEditDisabled}
    >
      <Row
        alignItems="center"
        justifyContent="space-between"
        className={cls.container}
      >
        <Row
          justifyContent="flex-start"
          alignItems="center"
          className={cls.leftSide}
        >
          <span>{t(labelKey)}</span>
        </Row>
        <Row
          alignItems="space-around"
          justifyContent={alignOnStart ? 'space-between' : 'flex-end'}
          className={cls.rightSide}
        >
          {isLoading && <Loader size={48} />}
          <div className={cls.fieldValue}>{!isLoading && children}</div>
          {!(isLoading ?? isEditDisabled) && (
            <Row
              alignItems="center"
              justifyContent="center"
              className={cls.iconWrapper}
            >
              <ChevronRightSVG />
            </Row>
          )}
        </Row>
      </Row>
    </Button>
  );
};
