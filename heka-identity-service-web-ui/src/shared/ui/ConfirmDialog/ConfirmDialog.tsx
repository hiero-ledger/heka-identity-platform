import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal/Modal';

import * as cls from './ConfirmDialog.module.scss';

interface ConfirmFormProps {
  isOpen: boolean;
  handleToggle: (value: boolean) => void;
  text?: string;
  details?: string;
  cancelButtonText?: string;
  acceptButtonText?: string;
  onAccept?: () => Promise<void>;
  onCancel?: () => Promise<void>;
}

export const ConfirmForm = ({
  isOpen,
  handleToggle,
  text,
  details,
  cancelButtonText,
  acceptButtonText,
  onAccept,
  onCancel,
}: ConfirmFormProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={text ?? t('Common.titles.confirmation')}
      isOpen={isOpen}
      handleToggle={handleToggle}
    >
      {details && <p>{details}</p>}
      <Button
        className={cls.cancelBtn}
        onPress={onCancel}
        fullWidth
      >
        {cancelButtonText ?? t('Common.buttons.cancel')}
      </Button>
      <Button
        className={cls.acceptBtn}
        onPress={onAccept}
        fullWidth
      >
        {acceptButtonText ?? t('Common.buttons.yes')}
      </Button>
    </Modal>
  );
};
