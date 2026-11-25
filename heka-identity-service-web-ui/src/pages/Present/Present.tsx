import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { CopyLink } from '@/components/Link/CopyLink';
import { QRCode } from '@/components/QRCode';
import { WebWalletButton } from '@/components/WebWalletButton';
import { WebWalletStatus } from '@/shared/lib/webWallet';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './Present.module.scss';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** The wallet fetches the request from there: https only, but http on this machine in development */
const isFetchableRequestUri = (requestUri: string) => {
  try {
    const { protocol, hostname } = new URL(requestUri);
    return (
      protocol === 'https:' ||
      (__IS_DEV__ && protocol === 'http:' && LOCAL_HOSTS.includes(hostname))
    );
  } catch {
    return false;
  }
};

type RequestProblem = 'missing' | 'requestUri' | 'method';

/**
 * The `openid4vp://` URI of an OpenID4VP request passed by reference, rebuilt from this page's
 * query, or what is wrong with that query
 */
const readRequest = (
  params: URLSearchParams,
): { uri: string } | { problem: RequestProblem } => {
  const clientId = params.get('client_id');
  const requestUri = params.get('request_uri');
  const method = params.get('request_uri_method');

  if (!clientId || !requestUri) return { problem: 'missing' };
  if (!isFetchableRequestUri(requestUri)) return { problem: 'requestUri' };
  if (method !== null && method !== 'get' && method !== 'post') {
    return { problem: 'method' };
  }

  const query = new URLSearchParams({
    client_id: clientId,
    request_uri: requestUri,
  });
  if (method) query.set('request_uri_method', method);
  return { uri: `openid4vp://?${query}` };
};

/**
 * A public page for a verifier's presentation request: a QR code for a mobile wallet and the
 * Heka Web Wallet button. It doesn't follow the verification, which belongs to the verifier.
 */
const Present = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [walletStatus, setWalletStatus] = useState<WebWalletStatus | null>(
    null,
  );

  const request = readRequest(searchParams);

  if ('problem' in request) {
    const problems: Record<RequestProblem, string> = {
      missing: t('Present.errors.missing'),
      requestUri: t('Present.errors.requestUri'),
      method: t('Present.errors.method'),
    };
    return (
      <Column className={cls.Present}>
        <Row className={cls.title}>{t('Present.titles.invalid')}</Row>
        <p
          className={cls.description}
          role="alert"
        >
          {problems[request.problem]}
        </p>
      </Column>
    );
  }

  return (
    <Column className={cls.Present}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('Present.titles.main')}</Row>
        <Row className={cls.description}>
          <p>
            {t('Common.titles.scanQR')}&nbsp;
            <CopyLink value={request.uri} />
          </p>
        </Row>
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        <QRCode content={request.uri} />
        <WebWalletButton
          uri={request.uri}
          onStatus={setWalletStatus}
        />
        {walletStatus?.state === 'done' && (
          <p
            className={cls.description}
            role="status"
          >
            {t('Present.messages.done')}
          </p>
        )}
        {walletStatus?.state === 'error' && (
          <p
            className={cls.description}
            role="alert"
          >
            {walletStatus.message || t('WebWallet.messages.failed')}
          </p>
        )}
      </Column>
    </Column>
  );
};

export default Present;
