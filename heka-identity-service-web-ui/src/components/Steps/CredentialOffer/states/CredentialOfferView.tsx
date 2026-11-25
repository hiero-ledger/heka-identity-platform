import { useTranslation } from 'react-i18next';

import {
  ConnectionChoice,
  ConnectionChoiceOptions,
} from '@/components/ExistingConnection';
import { CopyLink } from '@/components/Link/CopyLink';
import { QRCode } from '@/components/QRCode';
import { WebWalletButton } from '@/components/WebWalletButton';
import { formatDateTime } from '@/shared/lib/date';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../CredentialOffer.module.scss';

export interface CredentialOfferViewProps {
  value?: string;
  /** Pre-authorized code transaction code, which the holder enters in the wallet */
  txCode?: string;
  /** ISO date-time after which the offer can no longer be redeemed */
  expiresAt?: string;
  // Aries only: name the new connection or send over an existing one
  connection?: ConnectionChoiceOptions;
}

/** A pending credential offer: QR code and copy link, or the Aries connection choice */
export const CredentialOfferView = ({
  value,
  txCode,
  expiresAt,
  connection,
}: CredentialOfferViewProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('Flow.titles.credentialOffer')}</Row>
        {!connection?.isExistingConnectionSelected && (
          <Row
            className={cls.description}
            alignItems="center"
          >
            <p>
              {t('Common.titles.scanQR')}&nbsp;
              <CopyLink value={value} />
            </p>
          </Row>
        )}
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        {connection ? (
          <ConnectionChoice
            {...connection}
            qrValue={value}
            waitingText={t('Connection.titles.waitingOffer')}
          />
        ) : (
          <>
            {!value && <Loader />}
            {value && (
              <>
                <QRCode content={value} />
                <WebWalletButton
                  uri={value}
                  expiresAt={expiresAt}
                />
                {txCode && (
                  <Column
                    className={cls.txCode}
                    alignItems="center"
                  >
                    <p>{t('Flow.titles.txCode')}</p>
                    <Row
                      alignItems="center"
                      className={cls.txCodeValue}
                    >
                      <code>{txCode}</code>
                      <CopyLink
                        value={txCode}
                        text={t('Flow.buttons.copyTxCode')}
                      />
                    </Row>
                  </Column>
                )}
                {expiresAt && (
                  <p className={cls.description}>
                    {t('Flow.messages.offerExpires', {
                      time: formatDateTime(expiresAt),
                    })}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </Column>
    </>
  );
};
