import { TFunction } from 'i18next';

import { ConnectionRecord } from '@/entities/Connection';

// The holder's own label is the same for every Heka wallet ('didcomm-oob-invitation'), so it is never shown
export const getConnectionName = (
  connection: Pick<ConnectionRecord, 'id' | 'alias'>,
  t: TFunction,
): string => {
  const alias = connection.alias?.trim();
  if (alias) return alias;
  return t('Connection.titles.unnamed', { id: connection.id.slice(0, 8) });
};

export const formatConnectionDate = (createdAt: string): string => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

export const getConnectionLabel = (
  connection: Pick<ConnectionRecord, 'id' | 'alias' | 'createdAt'>,
  t: TFunction,
): string => {
  const name = getConnectionName(connection, t);
  const date = formatConnectionDate(connection.createdAt);
  return date ? `${name} · ${date}` : name;
};
