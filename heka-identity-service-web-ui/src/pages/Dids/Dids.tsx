import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import { didDetailsPath } from '@/app/routes/RoutePaths';
import { NoItemFound } from '@/components/NoItemFound/NoItemFound';
import {
  DidDocument,
  getDidItems,
  getDidMethod,
  getDids,
  getDidsError,
  getDidsFailedMethods,
  getDidsIsLoading,
  textInterpolation,
} from '@/entities/Did';
import { classNames } from '@/shared/lib/classNames';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { LoaderView } from '@/shared/ui/Loader';

import { DidsLayout } from './DidsLayout/DidsLayout';
import { LoadErrorAlert } from './LoadErrorAlert/LoadErrorAlert';

import * as cls from './Dids.module.scss';

const DidRow = ({ doc }: { doc: DidDocument }) => {
  const { t } = useTranslation();
  const method = getDidMethod(doc.id);
  const verificationMethods = doc.verificationMethod?.length ?? 0;
  const services = doc.service?.length ?? 0;

  return (
    <Link
      to={didDetailsPath(doc.id)}
      className={cls.row}
      aria-label={t('Dids.list.rowLabel', {
        did: doc.id,
        method,
        verificationMethods,
        services,
        ...textInterpolation,
      })}
    >
      <span className={cls.cell}>
        <span className={cls.mobileLabel}>
          {t('Dids.list.columns.did')}:{' '}
        </span>
        <span
          className={cls.did}
          title={doc.id}
        >
          {doc.id}
        </span>
      </span>
      <span className={cls.cell}>
        <span className={cls.mobileLabel}>
          {t('Dids.list.columns.method')}:{' '}
        </span>
        {method}
      </span>
      <span className={cls.cell}>
        <span className={cls.mobileLabel}>
          {t('Dids.list.columns.verificationMethods')}:{' '}
        </span>
        {verificationMethods}
      </span>
      <span className={cls.cell}>
        <span className={cls.mobileLabel}>
          {t('Dids.list.columns.services')}:{' '}
        </span>
        {services}
      </span>
    </Link>
  );
};

const Dids = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const items = useSelector(getDidItems);
  const isLoading = useSelector(getDidsIsLoading);
  const error = useSelector(getDidsError);
  const failedMethods = useSelector(getDidsFailedMethods);

  const loadList = useCallback(() => {
    dispatch(getDids());
  }, [dispatch]);

  // Reload on every visit, so the list is fresh
  useEffect(() => {
    loadList();
  }, [loadList]);

  const isLoaded = !isLoading && !error && items !== undefined;

  return (
    <DidsLayout>
      <h2 className={cls.title}>{t('Dids.titles.list')}</h2>

      {isLoading && (
        <div
          role="status"
          aria-label={t('Dids.list.loading')}
        >
          <LoaderView />
        </div>
      )}

      {!isLoading && error && (
        <LoadErrorAlert onRetry={loadList}>
          <p>{t('Dids.list.loadError')}</p>
          <p className={cls.errorDetails}>{error}</p>
        </LoadErrorAlert>
      )}

      {isLoaded && !!failedMethods?.length && (
        <LoadErrorAlert onRetry={loadList}>
          {failedMethods.map(({ method, message }) => (
            <p key={method}>
              {t('Dids.list.methodError', {
                method,
                message,
                ...textInterpolation,
              })}
            </p>
          ))}
        </LoadErrorAlert>
      )}

      {isLoaded && items.length === 0 && (
        // `NoItemFound` centres itself absolutely: this box below the title (and any warning)
        // is its positioning context, so it never covers them
        <div className={cls.empty}>
          <NoItemFound
            title={t('Dids.list.empty')}
            description={t('Dids.list.emptyDescription')}
          />
        </div>
      )}

      {isLoaded && items.length > 0 && (
        <div className={cls.list}>
          <div
            className={classNames(cls.row, {}, [cls.headerRow])}
            aria-hidden
          >
            <span className={cls.cell}>{t('Dids.list.columns.did')}</span>
            <span className={cls.cell}>{t('Dids.list.columns.method')}</span>
            <span className={cls.cell}>
              {t('Dids.list.columns.verificationMethods')}
            </span>
            <span className={cls.cell}>{t('Dids.list.columns.services')}</span>
          </div>
          <ul className={cls.items}>
            {items.map((doc) => (
              <li key={doc.id}>
                <DidRow doc={doc} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </DidsLayout>
  );
};

export default Dids;
