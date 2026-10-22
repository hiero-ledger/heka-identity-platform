import { useTranslation } from 'react-i18next';

import { QRCode } from '@/components/QRCode';
import { ConnectionRecord } from '@/entities/Connection';
import { Button } from '@/shared/ui/Button';
import { Column } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

import { ConnectionNameInput } from './ConnectionNameInput';
import { ExistingConnectionSelect } from './ExistingConnectionSelect';

import * as cls from './ConnectionChoice.module.scss';

export interface ConnectionChoiceOptions {
  connections: ConnectionRecord[];
  isExistingConnectionSelected: boolean;
  connectionAlias: string;
  canRename: boolean;
  renameInvitation: (alias: string) => void;
  selectConnection: (connectionId: string) => void;
  onUseQr: () => void;
}

interface ConnectionChoiceProps extends ConnectionChoiceOptions {
  qrValue?: string;
  waitingText: string;
}

export const ConnectionChoice = ({
  qrValue,
  waitingText,
  connections,
  isExistingConnectionSelected,
  connectionAlias,
  canRename,
  renameInvitation,
  selectConnection,
  onUseQr,
}: ConnectionChoiceProps) => {
  const { t } = useTranslation();

  if (isExistingConnectionSelected) {
    return (
      <Column
        className={cls.waiting}
        alignItems="center"
      >
        <Loader />
        <p className={cls.waitingText}>{waitingText}</p>
        <Button
          buttonType="text"
          className={cls.textButton}
          onPress={onUseQr}
        >
          {t('Connection.buttons.useQr')}
        </Button>
      </Column>
    );
  }

  return (
    <div className={cls.ConnectionChoice}>
      <Column
        className={cls.qrColumn}
        alignItems="center"
      >
        <Column className={cls.panel}>
          <ConnectionNameInput
            value={connectionAlias}
            isDisabled={!canRename}
            onApply={renameInvitation}
          />
        </Column>
        {qrValue ? <QRCode content={qrValue} /> : <Loader />}
      </Column>
      <ExistingConnectionSelect
        connections={connections}
        onSelect={selectConnection}
      />
    </div>
  );
};
