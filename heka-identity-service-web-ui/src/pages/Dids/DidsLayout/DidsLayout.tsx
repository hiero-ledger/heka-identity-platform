import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BasicPanel } from '@/components/Panel';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './DidsLayout.module.scss';

interface DidsLayoutProps {
  children: ReactNode;
}

/** The DIDs section: the title panel on the left, the content on the right. */
export const DidsLayout = ({ children }: DidsLayoutProps) => {
  const { t } = useTranslation();

  return (
    <Row className={cls.DidsLayout}>
      <BasicPanel title={t('Dids.titles.main')} />
      <Column className={cls.content}>{children}</Column>
    </Row>
  );
};
