import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { PlusButton } from '@/components/PlusButton';
import { Schema } from '@/entities/Schema';
import { selectSchemaLoading } from '@/entities/Schema/model/selectors/schemasSelector';
import { SchemaRegistration } from '@/entities/Schema/model/types/schema';
import { getUserDidDocuments } from '@/entities/User/model/selectors/userSelector';
import { fetchDidDocuments } from '@/entities/User/model/services/fetchDidDocuments';
import { RegistrationTargets } from '@/pages/IssueCredential/Schemas/RegistrationsList/RegistrationList.const';
import { RegistrationsListItem } from '@/pages/IssueCredential/Schemas/RegistrationsList/RegistrationsListItem/RegistrationsListItem';
import { RegistrationView } from '@/pages/IssueCredential/Schemas/RegistrationView/RegistrationView';
import { classNames } from '@/shared/lib/classNames';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column, Row } from '@/shared/ui/Grid';
import { Modal } from '@/shared/ui/Modal/Modal';

import * as cls from './RegistrationsList.module.scss';

interface RegistrationsListProps {
  schema: Schema;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
}
export const RegistrationsList = ({
  schema,
  isOpen,
  onOpenChange,
}: RegistrationsListProps) => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const { registrations } = schema;

  const isLoading = useSelector(selectSchemaLoading);
  const [isRegisterSchemaModalOpen, setRegisterSchemaModalOpen] =
    useState<boolean>(false);
  const didDocuments = useSelector(getUserDidDocuments);

  const [registrationsList, setRegistrationsList] = useState<
    SchemaRegistration[] | undefined
  >();

  useEffect(() => {
    setRegistrationsList(
      [...(registrations ?? [])].sort((a, b) => {
        if (a.protocol !== b.protocol)
          return a.protocol.localeCompare(b.protocol);
        if (a.credentialFormat !== b.credentialFormat)
          return a.credentialFormat.localeCompare(b.credentialFormat);
        if (a.network !== b.network) return a.network.localeCompare(b.network);
        return a.did.localeCompare(b.did);
      }),
    );
  }, [registrations]);

  useEffect(() => {
    dispatch(fetchDidDocuments({}));
  }, [dispatch]);

  const possibleRegistrations = useMemo(() => {
    const regs = [];
    for (const didDocument of didDocuments ?? []) {
      for (const registrationTarget of RegistrationTargets) {
        const match = didDocument.id.match(/did:\s*(.*?)\s*:/);
        if (match && (registrationTarget.network as string) === match[1]) {
          const registration = registrations?.find(
            (r) =>
              r.protocol === registrationTarget.protocol &&
              r.credentialFormat === registrationTarget.credentialFormat &&
              r.network === registrationTarget.network &&
              r.did === didDocument.id,
          );
          if (!registration)
            regs.push({
              ...registrationTarget,
              did: didDocument.id,
            });
        }
      }
    }
    return regs;
  }, [registrations, didDocuments]);

  const handleRegisterSchema = useCallback(() => {
    onOpenChange(false);
    setRegisterSchemaModalOpen(true);
  }, [onOpenChange]);

  const handleRegisterSchemaOnOpenChange = useCallback(
    async (value: boolean) => {
      setRegisterSchemaModalOpen(value);
      onOpenChange(!value);
    },
    [onOpenChange],
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        title={schema?.name as string}
        handleToggle={(isOpen) => {
          onOpenChange(isOpen);
        }}
      >
        <Row
          className={cls.header}
          alignItems="center"
          justifyContent={'space-between'}
        >
          <Column className={classNames(cls.title)}>
            {t('IssueCredential.schema.registrationList.title')}
          </Column>
          {possibleRegistrations.length > 0 && (
            <PlusButton
              title={t('IssueCredential.schema.hints.register')}
              onPress={handleRegisterSchema}
            />
          )}
        </Row>

        {(isLoading || registrations?.length === 0) && (
          <Column
            justifyContent={'center'}
            className={classNames(cls.list, {}, [cls.empty])}
          >
            {isLoading
              ? t('IssueCredential.schema.registrationList.loading')
              : t('IssueCredential.schema.registrationList.empty')}
          </Column>
        )}

        {!isLoading &&
          registrationsList?.map((r) => (
            <RegistrationsListItem
              key={`${r.protocol}${r.credentialFormat}${r.network}${r.did}`}
              item={r}
            />
          ))}
      </Modal>

      <RegistrationView
        schema={schema}
        isOpen={isRegisterSchemaModalOpen}
        onOpenChange={handleRegisterSchemaOnOpenChange}
        possibleRegistrations={possibleRegistrations}
      />
    </>
  );
};
