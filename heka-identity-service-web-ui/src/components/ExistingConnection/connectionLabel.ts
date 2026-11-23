import { TFunction } from 'i18next';

import { ConnectionRecord } from '@/entities/Connection';
import { formatDateTime } from '@/shared/lib/date';

// The holder's own label is the same for every Heka wallet ('didcomm-oob-invitation'), so it is never shown
export const getConnectionName = (
  connection: Pick<ConnectionRecord, 'id' | 'alias'>,
  t: TFunction,
): string => {
  const alias = connection.alias?.trim();
  if (alias) return alias;
  return t('Connection.titles.unnamed', { id: connection.id.slice(0, 8) });
};

export const getConnectionLabel = (
  connection: Pick<ConnectionRecord, 'id' | 'alias' | 'createdAt'>,
  t: TFunction,
): string => {
  const name = getConnectionName(connection, t);
  const date = formatDateTime(connection.createdAt);
  return date ? `${name} · ${date}` : name;
};
