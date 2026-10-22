import { useCallback, useState } from 'react';

import { ConfirmFormProps } from './ConfirmDialog';

interface ConfirmDialogProps {
  text?: string;
  details?: string;
  cancelButtonText?: string;
  acceptButtonText?: string;
  onAccept?: () => Promise<void>;
  onCancel?: () => Promise<void>;
}

/**
 * Open/close state for a confirmation dialog. Render it with `<ConfirmForm {...dialogProps} />`:
 * the hook returns props rather than a component, so the dialog is not remounted (losing its
 * close animation and focus restore) whenever the caller re-renders.
 */
export default function useConfirmDialog({
  text,
  details,
  cancelButtonText,
  acceptButtonText,
  onAccept,
  onCancel,
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const confirm = useCallback(() => setIsOpen(true), []);

  const handleCancel = useCallback(async () => {
    setIsOpen(false);
    if (onCancel) await onCancel();
  }, [onCancel]);

  const handleAccept = useCallback(async () => {
    setIsOpen(false);
    if (onAccept) await onAccept();
  }, [onAccept]);

  // Closing with the close button, the backdrop or Escape counts as cancelling
  const handleToggle = useCallback(
    (open: boolean) => {
      if (open) {
        setIsOpen(true);
      } else {
        void handleCancel();
      }
    },
    [handleCancel],
  );

  const dialogProps: ConfirmFormProps = {
    isOpen,
    handleToggle,
    text,
    details,
    cancelButtonText,
    acceptButtonText,
    onAccept: handleAccept,
    onCancel: handleCancel,
  };

  return { dialogProps, confirm };
}
