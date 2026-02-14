import { useTranslation } from 'react-i18next';

import { SchemaRegistration } from '@/entities/Schema/model/types/schema';
import { InfoRow } from '@/pages/IssueCredential/Schemas/RegistrationsList/RegistrationsListItem/InfoRow/InfoRow';
import { classNames } from '@/shared/lib/classNames';
import { Column } from '@/shared/ui/Grid';

import * as cls from './RegistrationsListItem.module.scss';

interface RegistrationsListItemProps {
  item: SchemaRegistration;
}

export const RegistrationsListItem = ({ item }: RegistrationsListItemProps) => {
  const { protocol, credentialFormat, network, did } = item;
  const { t } = useTranslation();

  return (
    <Column className={classNames(cls.list, {}, [cls.registrationWrapper])}>
      <InfoRow
        title={t('IssueCredential.schema.registrationDetails.protocol')}
        value={protocol}
      />
      <InfoRow
        title={t('IssueCredential.schema.registrationDetails.credentialFormat')}
        value={credentialFormat}
      />
      <InfoRow
        title={t('IssueCredential.schema.registrationDetails.network')}
        value={network}
      />
      <InfoRow
        title={t('IssueCredential.schema.registrationDetails.did')}
        value={did}
      />
    </Column>
  );
};
