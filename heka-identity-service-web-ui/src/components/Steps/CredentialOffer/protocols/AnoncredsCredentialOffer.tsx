import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { CredentialOfferProps } from '@/components/Steps';
import { CredentialSent } from '@/components/Steps/CredentialOffer/states/CredentialSent';
import { PendingCredential } from '@/components/Steps/CredentialOffer/states/PendingCredential';
import { getIsCredentialSent } from '@/entities/Credential/model/selectors/credentialSelector';
import { offerCredential } from '@/entities/Credential/model/services/offerCredential';
import { useConnection } from '@/shared/hooks/connection';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Column } from '@/shared/ui/Grid';

import * as cls from '../CredentialOffer.module.scss';

const CredentialOffered = <T extends object>({
  context,
}: CredentialOfferProps<T>) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const sendCredentialOffer = useCallback(
    (connectionId?: string) => {
      if (
        !context.protocolType ||
        !context.credentialType ||
        !context.network ||
        !context.did ||
        !context.credentialValues ||
        !context.schema
      ) {
        toast.error(t('IssueCredential.errors.BadContext'));
        return;
      }

      dispatch(
        offerCredential({
          protocolType: context.protocolType,
          credentialType: context.credentialType,
          connectionId,
          credentialValues: context.credentialValues,
          schema: context.schema,
          did: context.did,
          network: context.network,
          useDemo: context.useDemo,
        }),
      );
    },
    [
      context.protocolType,
      context.credentialType,
      context.network,
      context.did,
      context.credentialValues,
      context.schema,
      dispatch,
      t,
      context.useDemo,
    ],
  );

  const { connectionInvitation } = useConnection({
    onComplete: sendCredentialOffer,
  });

  return (
    <PendingCredential
      value={connectionInvitation}
      protocolType={context.protocolType}
      useDemo={context.useDemo}
    />
  );
};

export const AnoncredsCredentialOffer = <T extends object>(
  props: CredentialOfferProps<T>,
) => {
  const isCredentialSent = useSelector(getIsCredentialSent);

  return (
    <Column className={cls.CredentialOffer}>
      {isCredentialSent ? (
        <CredentialSent {...props} />
      ) : (
        <CredentialOffered {...props} />
      )}
    </Column>
  );
};
