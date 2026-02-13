import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { useMobile } from '@/components/Screen/Screen';
import { didMethodTypes } from '@/components/Steps/SelectNetwork/SelectNetwork.const';
import { StepTitle } from '@/components/StepTitle';
import { getCredentialsConfig } from '@/entities/Credential/model/selectors/credentialSelector';
import { ProtocolType } from '@/entities/Schema';
import { getUserDidDocuments } from '@/entities/User/model/selectors/userSelector';
import { fetchDidDocuments } from '@/entities/User/model/services/fetchDidDocuments';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { ButtonCards } from '@/shared/ui/ButtonCards';
import { Row } from '@/shared/ui/Grid';
import { Select } from '@/shared/ui/Select';

import * as cls from '../Steps.module.scss';

interface SelectNetworkStepProps {
  title: string;
  protocolType?: ProtocolType;
  did?: string;
  network?: string;
  onChangeDid?: (value: string | undefined) => void;
  onChangeNetwork: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  didOptional?: boolean;
}

export const SelectNetwork = ({
  title,
  protocolType,
  did,
  network,
  onChangeDid,
  onChangeNetwork,
  onPrev,
  onNext,
  didOptional,
}: SelectNetworkStepProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isMobile = useMobile();

  const didDocuments = useSelector(getUserDidDocuments);
  const credentialConfig = useSelector(getCredentialsConfig);

  useEffect(() => {
    if (network) {
      dispatch(
        fetchDidDocuments({
          method: network,
        }),
      );
    }
  }, [dispatch, network]);

  const networkOptions = useMemo(() => {
    if (!credentialConfig || !protocolType) return [];
    return didMethodTypes.filter((v) =>
      credentialConfig[protocolType].networks.includes(v.value),
    );
  }, [credentialConfig, protocolType]);

  const didOptions = useMemo(() => {
    return (
      didDocuments?.map((didDocument) => ({
        value: didDocument.id,
        content: didDocument.id,
      })) ?? []
    );
  }, [didDocuments]);

  useEffect(() => {
    if (network) return;
    if (onChangeNetwork && networkOptions.length > 0) {
      onChangeNetwork(networkOptions[0].value);
    }
  }, [network, networkOptions, protocolType]);

  useEffect(() => {
    if (onChangeDid && didOptions.length > 0) {
      onChangeDid(didOptions[0].value);
    }
  }, [didOptions, network]);

  const onNetworkChange = useCallback(
    (option: string) => {
      onChangeNetwork(option);
      if (onChangeDid) onChangeDid(undefined);
    },
    [onChangeNetwork, onChangeDid],
  );

  return (
    <>
      <StepTitle title={title} />
      {!isMobile && (
        <ButtonCards
          selected={network}
          options={networkOptions}
          onChange={onNetworkChange}
        />
      )}
      {isMobile && (
        <Select
          items={networkOptions}
          defaultSelectedKey={network}
          onSelect={onNetworkChange}
        />
      )}
      {network && onChangeDid && (
        <>
          <p className={cls.stepSubTitle}>{t('Flow.titles.selectDid')}</p>
          {!isMobile && (
            <ButtonCards
              direction="column"
              selected={did}
              options={didOptions}
              onChange={onChangeDid}
            />
          )}
          {isMobile && (
            <Select
              items={didOptions}
              defaultSelectedKey={did}
              onSelect={onChangeDid}
            />
          )}
        </>
      )}
      <Row className={cls.stepNavigation}>
        <Button
          buttonType="outlined"
          leftIcon="arrow-back"
          onPress={onPrev}
        >
          {t('Common.buttons.back')}
        </Button>
        <Button
          rightIcon="forward"
          isDisabled={!network || (!didOptional && !did)}
          onPress={onNext}
        >
          {t('Common.buttons.next')}
        </Button>
      </Row>
    </>
  );
};
