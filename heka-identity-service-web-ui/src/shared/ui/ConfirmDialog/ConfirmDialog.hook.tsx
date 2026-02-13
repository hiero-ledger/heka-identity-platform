import React, { useCallback, useState } from 'react';

import { ConfirmForm } from './ConfirmDialog';

interface ConfirmDialogProps {
  text?: string;
  details?: string;
  cancelButtonText?: string;
  acceptButtonText?: string;
  onAccept?: () => Promise<void>;
  onCancel?: () => Promise<void>;
}

export default function useConfirmDialog({
  text,
  details,
  cancelButtonText,
  acceptButtonText,
  onAccept,
  onCancel,
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const confirm = () => {
    setIsOpen(true);
  };

  const handleCancel = useCallback(async () => {
    setIsOpen(false);
    if (onCancel) await onCancel();
  }, [onCancel]);

  const handleAccept = useCallback(async () => {
    setIsOpen(false);
    if (onAccept) await onAccept();
  }, [onAccept]);

  const ConfirmDialog = useCallback(
    () => (
      <ConfirmForm
        isOpen={isOpen}
        handleToggle={async (isOpen) => {
          if (onCancel) await onCancel();
          setIsOpen(isOpen);
        }}
        text={text}
        details={details}
        cancelButtonText={cancelButtonText}
        acceptButtonText={acceptButtonText}
        onAccept={handleAccept}
        onCancel={handleCancel}
      />
    ),
    [
      isOpen,
      text,
      details,
      cancelButtonText,
      acceptButtonText,
      onCancel,
      handleAccept,
      handleCancel,
    ],
  );

  return {
    ConfirmDialog,
    confirm,
  };
}
