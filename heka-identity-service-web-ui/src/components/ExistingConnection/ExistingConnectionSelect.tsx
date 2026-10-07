import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectionRecord } from '@/entities/Connection';
import { Button } from '@/shared/ui/Button';
import { Column } from '@/shared/ui/Grid';
import { Select } from '@/shared/ui/Select';

import { getConnectionLabel } from './connectionLabel';

import * as cls from './ConnectionChoice.module.scss';

export interface ExistingConnectionSelectProps {
  connections: ConnectionRecord[];
  onSelect: (connectionId: string) => void;
}

export const ExistingConnectionSelect = ({
  connections,
  onSelect,
}: ExistingConnectionSelectProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>();

  const items = useMemo(
    () =>
      connections.map((connection) => ({
        value: connection.id,
        content: getConnectionLabel(connection, t),
      })),
    [connections, t],
  );

  if (!connections.length) return null;

  return (
    <Column className={cls.panel}>
      <p className={cls.panelTitle}>{t('Connection.titles.existing')}</p>
      <Select
        items={items}
        placeholder={t('Connection.titles.selectConnection')}
        onSelect={setSelectedId}
      />
      <Button
        isDisabled={!selectedId}
        onPress={() => selectedId && onSelect(selectedId)}
      >
        {t('Connection.buttons.send')}
      </Button>
    </Column>
  );
};
