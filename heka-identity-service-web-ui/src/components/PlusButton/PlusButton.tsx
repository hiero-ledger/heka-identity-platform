import { PressEvent } from '@react-types/shared/src/events';

import PlusIcon from '@/shared/assets/icons/add.svg';
import { Button } from '@/shared/ui/Button';

import * as cls from './PlusButton.module.scss';

interface PlusButtonProps {
  title?: string;
  onPress: (e: PressEvent) => void;
}

export const PlusButton = ({ title, onPress }: PlusButtonProps) => {
  return (
    <Button
      buttonType="tonal"
      onPress={onPress}
      aria-label={title}
      className={cls.button}
    >
      <div title={title}>
        <PlusIcon className={cls.icon} />
      </div>
    </Button>
  );
};
