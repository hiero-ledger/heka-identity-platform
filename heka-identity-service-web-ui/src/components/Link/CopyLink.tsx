import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { Link } from './Link';

interface CopyLinkProps {
  value?: string;
  /** The link's label; "click this link to copy." by default */
  text?: string;
}

export const CopyLink = ({ value, text }: CopyLinkProps) => {
  const { t } = useTranslation();

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(value ?? '');
    if (value) toast.success(t('Common.messages.copyLink'));
  }, [t, value]);

  return (
    <Link
      text={text ?? t('Common.titles.copyLink')}
      onClick={onCopy}
    />
  );
};
