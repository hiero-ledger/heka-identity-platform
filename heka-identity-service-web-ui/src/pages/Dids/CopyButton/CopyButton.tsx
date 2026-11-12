import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';

interface CopyButtonProps {
  value: string;
  /** Accessible name, e.g. "Copy DID" */
  label: string;
  className?: string;
  /** `outlined` matches the page's Back button; the default is a small text button */
  variant?: 'text' | 'outlined';
}

/** Copies `value` to the clipboard and confirms it with a toast. */
export const CopyButton = ({
  value,
  label,
  className,
  variant = 'text',
}: CopyButtonProps) => {
  const { t } = useTranslation();

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('Dids.details.copied'));
    } catch {
      // No clipboard (e.g. an insecure origin) or the permission was denied
      toast.error(t('Dids.details.copyFailed'));
    }
  }, [t, value]);

  return (
    <Button
      buttonType={variant}
      isSmall={variant === 'text'}
      aria-label={label}
      className={className}
      onPress={onCopy}
    >
      {t('Dids.details.copy')}
    </Button>
  );
};
