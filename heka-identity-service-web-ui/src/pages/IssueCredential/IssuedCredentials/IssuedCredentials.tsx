import { KeyboardEvent, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { NoItemFound } from '@/components/NoItemFound/NoItemFound';
import { getIssuedCredentials, IssuedCredential } from '@/entities/IssuedCredential';
import {
  getIssuedCredentialItems,
  getIssuedCredentialsError,
  getIssuedCredentialsIsLoading,
} from '@/entities/IssuedCredential/model/selectors/issuedCredentialsSelector';
import { classNames } from '@/shared/lib/classNames';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';

import { IssuedCredentialDetails } from './IssuedCredentialDetails/IssuedCredentialDetails';
import {
  formatIssuedAt,
  getIssuedCredentialStatus,
  protocolLabel,
  statusLabel,
} from './issuedCredentialView';

import * as cls from './IssuedCredentials.module.scss';

export const IssuedCredentials = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const items = useSelector(getIssuedCredentialItems);
  const isLoading = useSelector(getIssuedCredentialsIsLoading);
  const error = useSelector(getIssuedCredentialsError);

  const [selectedKey, setSelectedKey] = useState<string | undefined>();

  const loadList = useCallback(() => {
    dispatch(getIssuedCredentials());
  }, [dispatch]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openDetails = useCallback((item: IssuedCredential) => {
    setSelectedKey(item.key);
  }, []);

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, item: IssuedCredential) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetails(item);
      }
    },
    [openDetails],
  );

  const onDetailsOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedKey(undefined);
  }, []);

  return (
    <Column className={cls.wrapper}>
      <Row className={cls.header}>
        <h2 className={cls.title}>
          {t('IssueCredential.issuedCredentials.title')}
        </h2>
      </Row>

      {isLoading && (
        <div aria-label={t('IssueCredential.issuedCredentials.loading')}>
          <LoaderView />
        </div>
      )}

      {!isLoading && error && (
        <Column
          className={cls.error}
          role="alert"
        >
          <p>{t('IssueCredential.issuedCredentials.loadError')}</p>
          <p className={cls.errorDetails}>{error}</p>
          <Button onPress={loadList}>
            {t('IssueCredential.issuedCredentials.retry')}
          </Button>
        </Column>
      )}

      {!isLoading && !error && items?.length === 0 && (
        <NoItemFound
          title={t('IssueCredential.issuedCredentials.empty')}
          description={t('IssueCredential.issuedCredentials.emptyDescription')}
        />
      )}

      {!isLoading && !error && !!items?.length && (
        <div className={cls.list}>
          <div
            className={classNames(cls.row, {}, [cls.headerRow])}
            aria-hidden
          >
            <span className={cls.cell}>
              {t('IssueCredential.issuedCredentials.columns.schema')}
            </span>
            <span className={cls.cell}>
              {t('IssueCredential.issuedCredentials.columns.protocol')}
            </span>
            <span className={cls.cell}>
              {t('IssueCredential.issuedCredentials.columns.format')}
            </span>
            <span className={cls.cell}>
              {t('IssueCredential.issuedCredentials.columns.issued')}
            </span>
            <span className={cls.cell}>
              {t('IssueCredential.issuedCredentials.columns.status')}
            </span>
          </div>
          {items.map((item) => {
            const status = getIssuedCredentialStatus(item);
            const protocol = protocolLabel(item.protocol, t);
            const formats = item.formats.join(', ');
            const issuedAt = formatIssuedAt(item.issuedAt);
            const statusText = statusLabel(status, t);
            return (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                className={cls.row}
                onClick={() => openDetails(item)}
                onKeyDown={(event) => onRowKeyDown(event, item)}
              >
                <span
                  className={classNames(cls.cell, {}, [cls.name])}
                  title={item.name}
                >
                  {item.name}
                </span>
                <span
                  className={cls.cell}
                  title={protocol}
                >
                  {protocol}
                </span>
                <span
                  className={cls.cell}
                  title={formats}
                >
                  {formats}
                </span>
                <span
                  className={cls.cell}
                  title={issuedAt}
                >
                  {issuedAt}
                </span>
                <span
                  className={classNames(cls.cell, {}, [
                    cls.status,
                    cls[status],
                  ])}
                  data-status={status}
                  title={statusText}
                >
                  {statusText}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <IssuedCredentialDetails
        itemKey={selectedKey}
        onOpenChange={onDetailsOpenChange}
      />
    </Column>
  );
};
