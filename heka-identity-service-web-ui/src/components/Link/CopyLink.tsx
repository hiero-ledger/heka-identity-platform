import React, { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { Link } from './Link';

interface CopyLinkProps {
  value?: string;
}

export const CopyLink = ({ value }: CopyLinkProps) => {
  const { t } = useTranslation();

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(value ?? '');
    if (value) toast.success(t('Common.messages.copyLink'));
  }, [t, value]);

  return (
    <Link
      text={t('Common.titles.copyLink')}
      onClick={onCopy}
    />
  );
};
