import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { BasicPanel, PanelWithMenu } from '@/components/Panel';
import { panelVerificationMenuItems } from '@/entities/User/model/const';
import { VerifyCredentialMenu } from '@/pages/VerifyCredential/VerifyCredentialMenu/VerifyCredentialMenu';
import { Row } from '@/shared/ui/Grid';

import { VerifyCredentialRoutes } from './VerifyCredentialRotes';

import * as cls from './VerifyCredential.module.scss';

const VerifyCredential = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const activeItem = useMemo(() => {
    const item = panelVerificationMenuItems.find(
      (x) => x.route === location.pathname,
    );
    return item ? item.title : t('Common.buttons.menu');
  }, [location, t]);

  const isAdvancedVerification = useMemo(() => {
    return location.pathname === ROUTES.ADVANCED_VERIFICATION;
  }, [location]);

  return (
    <Row className={cls.VerifyCredentialWrapper}>
      {isAdvancedVerification && (
        <BasicPanel
          title={t('VerifyCredential.titles.advancedVerification')}
          icon="documents"
        />
      )}
      {!isAdvancedVerification && (
        <PanelWithMenu
          panelMenu={<VerifyCredentialMenu />}
          title={t('VerifyCredential.titles.main')}
          activeItem={activeItem}
        />
      )}
      <VerifyCredentialRoutes />
    </Row>
  );
};

export default VerifyCredential;
