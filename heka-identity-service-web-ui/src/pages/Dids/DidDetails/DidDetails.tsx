import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import {
  DidDocument,
  DidService,
  DidVerificationMethod,
  DidVerificationRelationshipEntry,
  formatValue,
  getDidById,
  getDidItems,
  getDidMethod,
  getDids,
  getDidsError,
  getDidsFailedMethods,
  getDidsIsLoading,
  getPublicKey,
  textInterpolation,
  toList,
  VERIFICATION_RELATIONSHIPS,
} from '@/entities/Did';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { LoaderView } from '@/shared/ui/Loader';

import { CopyButton } from '../CopyButton/CopyButton';
import { DidsLayout } from '../DidsLayout/DidsLayout';
import { LoadErrorAlert } from '../LoadErrorAlert/LoadErrorAlert';

import * as cls from './DidDetails.module.scss';

// Every value from a DID document is rendered as text: documents come from ledgers, so a
// `serviceEndpoint` may well be a `javascript:` URL and must never become a link.

/** One key/value pair of a `<dl>`; hidden when there is no value. */
const Field = ({ label, values }: { label: string; values: ReactNode[] }) => {
  if (values.length === 0) return null;
  return (
    <div className={cls.field}>
      <dt className={cls.label}>{label}</dt>
      {values.map((value, index) => (
        <dd
          key={index}
          className={cls.value}
        >
          {value}
        </dd>
      ))}
    </div>
  );
};

const Text = ({ value }: { value: unknown }) => {
  const text = formatValue(value);
  return typeof value === 'string' ? (
    <code className={cls.code}>{text}</code>
  ) : (
    <pre className={cls.code}>{text}</pre>
  );
};

const VerificationMethodView = ({
  method,
}: {
  method: DidVerificationMethod;
}) => {
  const { t } = useTranslation();
  const publicKey = getPublicKey(method);

  return (
    <dl className={cls.card}>
      <Field
        label={t('Dids.details.id')}
        values={toList(method.id).map((id) => (
          <Text
            key={id}
            value={id}
          />
        ))}
      />
      <Field
        label={t('Dids.details.type')}
        values={toList(method.type).map((type) => (
          <Text
            key={type}
            value={type}
          />
        ))}
      />
      <Field
        label={t('Dids.details.controller')}
        values={toList(method.controller).map((controller) => (
          <Text
            key={controller}
            value={controller}
          />
        ))}
      />
      {publicKey && (
        <Field
          label={publicKey.label}
          values={[
            <span
              key="key"
              className={cls.copyable}
            >
              <Text value={publicKey.value} />
              <CopyButton
                value={publicKey.value}
                label={t('Dids.details.copyPublicKey')}
              />
            </span>,
          ]}
        />
      )}
    </dl>
  );
};

const RelationshipEntry = ({
  entry,
}: {
  entry: DidVerificationRelationshipEntry;
}) =>
  typeof entry === 'string' ? (
    <Text value={entry} />
  ) : (
    <VerificationMethodView method={entry} />
  );

const SERVICE_PROPERTIES = ['id', 'type', 'serviceEndpoint'];

const ServiceView = ({ service }: { service: DidService }) => {
  const { t } = useTranslation();
  const extras = Object.entries(service).filter(
    ([key]) => !SERVICE_PROPERTIES.includes(key),
  );

  return (
    <dl className={cls.card}>
      <Field
        label={t('Dids.details.id')}
        values={toList(service.id).map((id) => (
          <Text
            key={id}
            value={id}
          />
        ))}
      />
      <Field
        label={t('Dids.details.type')}
        values={toList(service.type).map((type) => (
          <Text
            key={type}
            value={type}
          />
        ))}
      />
      {service.serviceEndpoint !== undefined && (
        <Field
          label={t('Dids.details.serviceEndpoint')}
          values={[
            <Text
              key="endpoint"
              value={service.serviceEndpoint}
            />,
          ]}
        />
      )}
      {extras.map(([key, value]) => (
        <Field
          key={key}
          label={key}
          values={[
            <Text
              key={key}
              value={value}
            />,
          ]}
        />
      ))}
    </dl>
  );
};

const DidDocumentView = ({ doc }: { doc: DidDocument }) => {
  const { t } = useTranslation();
  const rawJson = useMemo(() => JSON.stringify(doc, null, 2), [doc]);
  const relationships = VERIFICATION_RELATIONSHIPS.filter(
    (name) => doc[name] !== undefined,
  );

  return (
    <>
      <section
        className={cls.section}
        aria-labelledby="did-overview"
      >
        <h3
          id="did-overview"
          className={cls.sectionTitle}
        >
          {t('Dids.details.overview')}
        </h3>
        <dl className={cls.card}>
          <Field
            label={t('Dids.details.method')}
            values={[getDidMethod(doc.id)]}
          />
          <Field
            label={t('Dids.details.context')}
            values={toList(doc['@context']).map((context, index) => (
              <Text
                key={index}
                value={context}
              />
            ))}
          />
          <Field
            label={t('Dids.details.controller')}
            values={toList(doc.controller).map((controller) => (
              <Text
                key={controller}
                value={controller}
              />
            ))}
          />
          <Field
            label={t('Dids.details.alsoKnownAs')}
            values={toList(doc.alsoKnownAs).map((alias) => (
              <Text
                key={alias}
                value={alias}
              />
            ))}
          />
        </dl>
      </section>

      {!!doc.verificationMethod?.length && (
        <section
          className={cls.section}
          aria-labelledby="did-verification-methods"
        >
          <h3
            id="did-verification-methods"
            className={cls.sectionTitle}
          >
            {t('Dids.details.verificationMethods')}
          </h3>
          <ul className={cls.items}>
            {doc.verificationMethod.map((method, index) => (
              <li key={`${method.id}-${index}`}>
                <VerificationMethodView method={method} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {relationships.length > 0 && (
        <section
          className={cls.section}
          aria-labelledby="did-verification-relationships"
        >
          <h3
            id="did-verification-relationships"
            className={cls.sectionTitle}
          >
            {t('Dids.details.verificationRelationships')}
          </h3>
          <dl className={cls.card}>
            {relationships.map((name) => {
              const entries = toList(doc[name]);
              return (
                <Field
                  key={name}
                  label={t(`Dids.details.relationships.${name}`)}
                  values={
                    entries.length
                      ? entries.map((entry, index) => (
                          <RelationshipEntry
                            key={index}
                            entry={entry}
                          />
                        ))
                      : [t('Dids.details.noEntries')]
                  }
                />
              );
            })}
          </dl>
        </section>
      )}

      {!!doc.service?.length && (
        <section
          className={cls.section}
          aria-labelledby="did-services"
        >
          <h3
            id="did-services"
            className={cls.sectionTitle}
          >
            {t('Dids.details.services')}
          </h3>
          <ul className={cls.items}>
            {doc.service.map((service, index) => (
              <li key={`${service.id}-${index}`}>
                <ServiceView service={service} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className={cls.rawJson}>
        <summary className={cls.sectionTitle}>
          {t('Dids.details.rawJson')}
        </summary>
        {/* Content of <details>: shown only while it is open, on the summary's line */}
        <CopyButton
          value={rawJson}
          label={t('Dids.details.copyJson')}
          variant="outlined"
          className={cls.rawJsonCopy}
        />
        <pre
          className={cls.code}
          data-testid="did-raw-json"
        >
          {rawJson}
        </pre>
      </details>
    </>
  );
};

const DidDetails = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  // React Router has already decoded the path segment: compare it with the ids as it is
  const { did } = useParams();

  const selectDoc = useMemo(() => getDidById(did), [did]);
  const doc = useSelector(selectDoc);
  const items = useSelector(getDidItems);
  const isLoading = useSelector(getDidsIsLoading);
  const error = useSelector(getDidsError);
  const failedMethods = useSelector(getDidsFailedMethods);

  const loadList = useCallback(() => {
    dispatch(getDids());
  }, [dispatch]);

  // A deep link or a reload: the list has not been loaded yet
  const needsLoad = items === undefined && !isLoading && !error;
  useEffect(() => {
    if (needsLoad) loadList();
  }, [needsLoad, loadList]);

  const methodError =
    did === undefined
      ? undefined
      : failedMethods?.find(({ method }) => method === getDidMethod(did));

  let content: ReactNode;
  if (doc) {
    content = <DidDocumentView doc={doc} />;
  } else if (isLoading || needsLoad) {
    content = (
      <div
        role="status"
        aria-label={t('Dids.list.loading')}
      >
        <LoaderView />
      </div>
    );
  } else if (error) {
    content = (
      <LoadErrorAlert onRetry={loadList}>
        <p>{t('Dids.list.loadError')}</p>
        <p className={cls.muted}>{error}</p>
      </LoadErrorAlert>
    );
  } else if (methodError) {
    content = (
      <LoadErrorAlert onRetry={loadList}>
        <p>
          {t('Dids.list.methodError', {
            method: methodError.method,
            message: methodError.message,
            ...textInterpolation,
          })}
        </p>
      </LoadErrorAlert>
    );
  } else {
    content = (
      <div className={cls.notFound}>
        <h3 className={cls.sectionTitle}>{t('Dids.details.notFound')}</h3>
        <p className={cls.muted}>{t('Dids.details.notFoundDescription')}</p>
      </div>
    );
  }

  return (
    <DidsLayout>
      <div className={cls.back}>
        <Button
          buttonType="outlined"
          leftIcon="arrow-back"
          onPress={() => navigate(ROUTES.DIDS)}
        >
          {t('Common.buttons.back')}
        </Button>
      </div>
      <header className={cls.header}>
        <h2 className={cls.title}>{t('Dids.titles.details')}</h2>
        {did !== undefined && (
          <div className={cls.copyable}>
            <code
              className={cls.did}
              data-testid="did-value"
            >
              {did}
            </code>
            {doc && (
              <CopyButton
                value={doc.id}
                label={t('Dids.details.copyDid')}
              />
            )}
          </div>
        )}
      </header>
      {content}
    </DidsLayout>
  );
};

export default DidDetails;
