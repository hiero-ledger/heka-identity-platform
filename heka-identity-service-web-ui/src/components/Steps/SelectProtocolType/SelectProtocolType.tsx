import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { useMobile } from '@/components/Screen/Screen';
import {
  credentialTypes,
  protocolsTypes,
} from '@/components/Steps/SelectProtocolType/SelectProtocolType.const';
import { StepTitle } from '@/components/StepTitle';
import { getCredentialsConfig } from '@/entities/Credential/model/selectors/credentialSelector';
import { getCredentialConfig } from '@/entities/Credential/model/services/getCredentialConfig';
import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { ButtonCards } from '@/shared/ui/ButtonCards';
import { Row } from '@/shared/ui/Grid';
import { Select } from '@/shared/ui/Select';

import * as cls from '../Steps.module.scss';

interface SelectProtocolTypeStepProps {
  title: string;
  protocolType?: ProtocolType;
  credentialType?: string;
  onChangeProtocolType: (value: string) => void;
  onChangeCredentialType: (value: string | undefined) => void;
  onNext: () => void;
}

export const SelectProtocolType = ({
  title,
  protocolType,
  credentialType,
  onChangeProtocolType,
  onChangeCredentialType,
  onNext,
}: SelectProtocolTypeStepProps) => {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(getCredentialConfig());

    if (!protocolType && !credentialType) {
      onChangeProtocolType(ProtocolType.Aries);
      onChangeCredentialType(AriesCredentialFormat.AnoncredsIndy);
    }
  }, [
    dispatch,
    protocolType,
    credentialType,
    onChangeProtocolType,
    onChangeCredentialType,
  ]);

  const onProtocolTypeChange = useCallback(
    (option: string) => {
      onChangeProtocolType(option);
      const credentialType =
        option === ProtocolType.Aries
          ? AriesCredentialFormat.AnoncredsIndy
          : option === ProtocolType.Oid4vc
            ? Openid4CredentialFormat.SdJwt
            : undefined;
      onChangeCredentialType(credentialType);
    },
    [onChangeProtocolType, onChangeCredentialType],
  );

  const credentialConfig = useSelector(getCredentialsConfig);

  const protocolOptions = useMemo(() => {
    return credentialConfig
      ? protocolsTypes.filter((p) =>
          Object.keys(credentialConfig).includes(p.value),
        )
      : [];
  }, [credentialConfig]);

  const credentialOptions = useMemo(() => {
    if (!credentialConfig || !protocolType) return [];
    const opts = credentialConfig[protocolType].credentials ?? [];
    return credentialTypes[protocolType].filter((p) => opts.includes(p.value));
  }, [credentialConfig, protocolType]);

  return (
    <>
      <StepTitle title={title} />
      {!isMobile && (
        <ButtonCards
          selected={protocolType}
          options={protocolOptions}
          onChange={onProtocolTypeChange}
        />
      )}
      {isMobile && (
        <Select
          items={protocolOptions}
          defaultSelectedKey={protocolType}
          onSelect={onProtocolTypeChange}
        />
      )}
      {!!protocolType && (
        <>
          <p className={cls.stepSubTitle}>
            {t('Flow.titles.selectCredentialType')}
          </p>
          {!isMobile && (
            <ButtonCards
              selected={credentialType}
              options={credentialOptions}
              onChange={onChangeCredentialType}
            />
          )}
          {isMobile && (
            <Select
              items={credentialOptions}
              defaultSelectedKey={credentialType}
              onSelect={onChangeCredentialType}
            />
          )}
        </>
      )}
      <Row className={cls.stepNavigation}>
        <Button
          rightIcon="forward"
          isDisabled={!protocolType || !credentialType}
          onPress={onNext}
        >
          {t('Common.buttons.next')}
        </Button>
      </Row>
    </>
  );
};
