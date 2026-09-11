import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { PresentationRequestContext } from '@/components/Steps';
import { getPresentationRequestIsLoading } from '@/entities/Presentation/model/selectors/presentationSelector';
import { requestPresentation } from '@/entities/Presentation/model/services/requestPresentation';
import {
  fetchX509Signers,
  X509Signer,
} from '@/entities/X509Signer';
import { isEnvDefaultSignerX5c } from '@/shared/lib/dcApi';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';
import { Select, SelectOption } from '@/shared/ui/Select';

import * as cls from '../VerificationRequest.module.scss';
import {
  reconcileSignerKey,
  resolveSignerSelection,
  SIGNER_DEFAULT,
  SIGNER_DID,
} from './signerSelection';

interface DcApiPresentationProps {
  context: PresentationRequestContext;
  onBack?: () => void;
}

export const DcApiPresentation = ({
  context,
  onBack,
}: DcApiPresentationProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isLoading = useSelector(getPresentationRequestIsLoading);
  const [error, setError] = useState<string | undefined>();
  const requestRef = useRef<{ abort: () => void } | null>(null);

  const [identities, setIdentities] = useState<Array<X509Signer>>([]);
  const [signerKey, setSignerKey] = useState<string>(SIGNER_DEFAULT);

  // List the verifier's X.509 signers to offer them as signers. Degrades silently to the
  // DID-only flow when none are provisioned (or the list can't be read). The request is aborted
  // when the step unmounts before it answers.
  useEffect(() => {
    let active = true;
    const request = dispatch(fetchX509Signers({ useDemo: context.useDemo }));

    const loadIdentities = async () => {
      const result = await request;
      if (active && fetchX509Signers.fulfilled.match(result)) {
        setIdentities(result.payload.identities);
      }
    };

    loadIdentities();

    return () => {
      active = false;
      request.abort();
    };
  }, [dispatch, context.useDemo]);

  // A chosen X.509 identity that disappeared (or expired) with a reload falls back to the default,
  // so what the picker shows is always what the request is sent with.
  useEffect(() => {
    setSignerKey((current) => reconcileSignerKey(current, identities));
  }, [identities]);

  const signerItems = useMemo<Array<SelectOption>>(() => {
    const identityOption = (identity: X509Signer): SelectOption => {
      const label =
        identity.commonName ??
        identity.sanDnsName ??
        `${identity.fingerprint.slice(0, 12)}…`;
      const content =
        t('PresentationOptions.signer.x509', {
          prefix: identity.clientIdPrefix,
          label,
        }) +
        (identity.isDefault ? t('PresentationOptions.signer.defaultTag') : '') +
        (identity.expired ? t('PresentationOptions.signer.expiredTag') : '');
      // An expired certificate cannot sign a request the wallet would accept — shown, not selectable.
      return { value: identity.id, content, isDisabled: identity.expired };
    };

    return [
      { value: SIGNER_DEFAULT, content: t('PresentationOptions.signer.default') },
      { value: SIGNER_DID, content: t('PresentationOptions.signer.did') },
      ...identities.map(identityOption),
    ];
  }, [identities, t]);

  // The picker is offered whenever there is something to choose from, or when the build default is an
  // X.509 signer that has not been provisioned yet (then the DID option is the only working choice).
  const noSignerForX5cDefault = identities.length === 0 && isEnvDefaultSignerX5c();
  const showSignerPicker = identities.length > 0 || noSignerForX5cDefault;

  const onPresent = async () => {
    if (!context.protocolType || !context.credentialType || !context.schema) {
      setError(t('VerifyCredential.errors.BadContext'));
      return;
    }

    setError(undefined);

    const request = dispatch(
      requestPresentation({
        protocolType: context.protocolType,
        credentialType: context.credentialType,
        schema: context.schema,
        requestedAttributes: context.attributes,
        did: context.did,
        useDemo: context.useDemo,
        useDcApi: true,
        requestSignerSelection: resolveSignerSelection(signerKey, identities),
      }),
    );
    requestRef.current = request;

    const result = await request;
    requestRef.current = null;

    if (requestPresentation.rejected.match(result)) {
      // `meta.aborted` is set when we abort via Cancel; otherwise the payload carries the
      // classified DcApiErrorCode ('cancelled' | 'unsupported' | 'failed') from the thunk.
      const code = result.meta.aborted ? 'cancelled' : result.payload;
      if (code === 'cancelled') {
        setError(t('PresentationOptions.errors.cancelled'));
      } else if (code === 'unsupported') {
        setError(t('PresentationOptions.errors.unsupported'));
      } else if (code === 'rejected') {
        setError(t('PresentationOptions.errors.rejected'));
      } else {
        setError(t('PresentationOptions.errors.failed'));
      }
    }
  };

  const onCancel = () => {
    requestRef.current?.abort();
  };

  return (
    <Column className={cls.requestContent}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('PresentationOptions.titles.dcApi')}</Row>
        <Row className={cls.description}>
          <p>{t('PresentationOptions.descriptions.dcApi')}</p>
        </Row>
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        {isLoading ? (
          <Column className={cls.buttonGroup}>
            <Loader />
            <Button
              buttonType="text"
              onPress={onCancel}
            >
              {t('PresentationOptions.buttons.cancel')}
            </Button>
          </Column>
        ) : (
          <Column className={cls.buttonGroup}>
            {showSignerPicker && (
              <Select
                items={signerItems}
                // Controlled by the parent state: the Select mounts only after the list loaded and
                // must show the choice that will actually be sent, not a fresh default.
                defaultSelectedKey={signerKey}
                onSelect={setSignerKey}
                placeholder={t('PresentationOptions.signer.label')}
              />
            )}
            {noSignerForX5cDefault && (
              <Row className={cls.description}>
                <p>{t('PresentationOptions.signer.noneProvisioned')}</p>
              </Row>
            )}
            <Button
              buttonType="filled"
              onPress={onPresent}
            >
              {t('PresentationOptions.buttons.present')}
            </Button>
            {error && (
              <Row className={cls.description}>
                <p>{error}</p>
              </Row>
            )}
            {onBack && (
              <Button
                buttonType="text"
                className={cls.textButton}
                onPress={onBack}
              >
                {t('Common.buttons.back')}
              </Button>
            )}
          </Column>
        )}
      </Column>
    </Column>
  );
};
