import { useRef } from 'react';
import { Input } from 'react-aria-components';

import { EditField } from '@/components/EditField/EditField';
import { classNames } from '@/shared/lib/classNames';

import * as cls from './BackgroundColorField.module.scss';

interface BackgroundColorFieldProp {
  alignOnStart?: boolean;
  color: string;
  selectColor: (color: string) => void;
  className?: string;
  isLoading?: boolean;
}

export const BackgroundColorField = ({
  alignOnStart,
  color,
  selectColor,
  className,
  isLoading,
}: BackgroundColorFieldProp) => {
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <EditField
      isLoading={isLoading}
      alignOnStart={alignOnStart}
      className={classNames(className ?? '', {}, ['color-picker'])}
      onPress={() => colorInputRef.current?.click()}
      labelKey="Common.buttons.background"
    >
      <Input
        ref={colorInputRef}
        className={cls.colorInput}
        type="color"
        value={color}
        onChange={(e) => selectColor((e.target as HTMLInputElement).value)}
      />
    </EditField>
  );
};
