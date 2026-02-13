import { Dialog, Modal as AreaModal, Heading } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';

import * as cls from './Modal.module.scss';
import './style.scss';

interface ModalProps {
  title: string;
  isOpen: boolean;
  handleToggle: (value: boolean) => void;
  children: React.ReactNode;
}

export const Modal = ({
  title,
  isOpen,
  handleToggle,
  children,
}: ModalProps) => {
  const { t } = useTranslation();

  return (
    <AreaModal
      isOpen={isOpen}
      onOpenChange={handleToggle}
    >
      <div className={cls.closeBtnWrapper}>
        <Button
          buttonType="shutter"
          aria-label="close button"
          leftIcon="close"
          className={cls.closeButton}
          onPress={() => handleToggle(false)}
        />
        <span className={cls.escText}>{t('Common.buttons.esc')}</span>
      </div>
      <Dialog className={cls.dialog}>
        <Button
          buttonType="text"
          aria-label="close button"
          leftIcon="close-black"
          className={cls.closeButton}
          onPress={() => handleToggle(false)}
        />
        <header className={cls.header}>
          <Heading
            slot="title"
            title={title}
            className={`text-headline-l ${cls['modal-title']}`}
          >
            {title}
          </Heading>
        </header>
        {children}
      </Dialog>
    </AreaModal>
  );
};
