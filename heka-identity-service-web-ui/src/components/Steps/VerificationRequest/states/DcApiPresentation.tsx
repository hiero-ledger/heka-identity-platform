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
import { RequestSignerSelection } from '@/shared/lib/dcApi';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';
import { Select, SelectOption } from '@/shared/ui/Select';

import * as cls from '../VerificationRequest.module.scss';

// Picker keys for the two non-X.509 choices; any other key is an X.509 identity id.
const SIGNER_DEFAULT = 'default';
const SIGNER_DID = 'did';

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
  // DID-only flow when none are provisioned (or the list can't be read).
  useEffect(() => {
    let active = true;

    const loadIdentities = async () => {
      const result = await dispatch(
        fetchX509Signers({ useDemo: context.useDemo }),
      );
      if (active && fetchX509Signers.fulfilled.match(result)) {
        setIdentities(result.payload.identities);
      }
    };

    loadIdentities();

    return () => {
      active = false;
    };
  }, [dispatch, context.useDemo]);

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
      return { value: identity.id, content };
    };

    return [
      { value: SIGNER_DEFAULT, content: t('PresentationOptions.signer.default') },
      { value: SIGNER_DID, content: t('PresentationOptions.signer.did') },
      ...identities.map(identityOption),
    ];
  }, [identities, t]);

  const resolveSignerSelection = (): RequestSignerSelection | undefined => {
    if (signerKey === SIGNER_DEFAULT) {
      return undefined; // use the build-time .env default
    }
    if (signerKey === SIGNER_DID) {
      return { method: 'did' };
    }
    const identity = identities.find((item) => item.id === signerKey);
    return identity
      ? {
          method: 'x5c',
          clientIdPrefix: identity.clientIdPrefix,
          certificateId: identity.id,
        }
      : undefined;
  };

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
        requestSignerSelection: resolveSignerSelection(),
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
            {identities.length > 0 && (
              <Select
                items={signerItems}
                defaultSelectedKey={SIGNER_DEFAULT}
                onSelect={setSignerKey}
                placeholder={t('PresentationOptions.signer.label')}
              />
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
