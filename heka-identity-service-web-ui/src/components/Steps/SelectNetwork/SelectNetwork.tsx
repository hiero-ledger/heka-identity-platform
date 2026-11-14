import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMobile } from '@/components/Screen/Screen';
import { didMethodTypes } from '@/components/Steps/SelectNetwork/SelectNetwork.const';
import { StepTitle } from '@/components/StepTitle';
import { useGetCredentialConfigQuery } from '@/entities/Credential/api/credentialApi';
import { ProtocolType } from '@/entities/Schema';
import { useGetOwnDidsQuery } from '@/entities/User/api/userApi';
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
  const isMobile = useMobile();

  const { data: credentialConfig } = useGetCredentialConfigQuery();
  // `currentData` belongs to the selected network only: a network switch never shows (or
  // selects) the previous network's DIDs while the new ones load
  const { currentData: didDocuments } = useGetOwnDidsQuery(
    { method: network },
    { skip: !network },
  );

  const networkOptions = useMemo(() => {
    if (!credentialConfig || !protocolType) return [];
    return didMethodTypes.filter((v) =>
      credentialConfig[protocolType].networks.includes(v.value),
    );
  }, [credentialConfig, protocolType]);

  const areDidsLoaded = !!network && didDocuments !== undefined;
  const didOptions = useMemo(() => {
    if (!areDidsLoaded) return [];
    return (
      didDocuments?.map((didDocument) => ({
        value: didDocument.id,
        content: didDocument.id,
      })) ?? []
    );
  }, [areDidsLoaded, didDocuments]);

  useEffect(() => {
    if (network) return;
    if (onChangeNetwork && networkOptions.length > 0) {
      onChangeNetwork(networkOptions[0].value);
    }
  }, [network, networkOptions, protocolType, onChangeNetwork]);

  // Once the network's DIDs are loaded: keep a DID that is among them (going Back, editing a
  // template), otherwise default to the first one, or clear it when the network has none
  useEffect(() => {
    if (!onChangeDid || !areDidsLoaded) return;
    if (did && didOptions.some((option) => option.value === did)) return;
    const firstDid = didOptions[0]?.value;
    if (firstDid !== did) onChangeDid(firstDid);
  }, [areDidsLoaded, did, didOptions, onChangeDid]);

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
