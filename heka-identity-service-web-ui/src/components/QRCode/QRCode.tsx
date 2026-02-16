import { QRCodeSVG } from 'qrcode.react';

import { Row } from '@/shared/ui/Grid';

import * as cls from './QRCode.module.scss';

export interface QRCodeProps {
  content: string;
  size?: number;
}

export const QRCode = ({ content, size }: QRCodeProps) => {
  return (
    <Row className={cls.QRCode}>
      <QRCodeSVG
        value={content}
        size={size ?? 280}
      />
    </Row>
  );
};
