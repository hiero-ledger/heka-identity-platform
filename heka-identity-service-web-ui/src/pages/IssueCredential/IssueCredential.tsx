import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { BasicPanel, PanelWithMenu } from '@/components/Panel';
import { panelIssuanceMenuItems } from '@/entities/User/model/const';
import * as cls from '@/pages/IssueCredential/IssueCredential.module.scss';
import { IssueCredentialMenu } from '@/pages/IssueCredential/IssueCredentialMenu/IssueCredentialMenu';
import { IssueCredentialRoutes } from '@/pages/IssueCredential/IssueCredentialRoutes';
import { Row } from '@/shared/ui/Grid';

const IssueCredential = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const activeItem = useMemo(() => {
    const item = panelIssuanceMenuItems.find(
      (x) => x.route === location.pathname,
    );
    return item ? item.title : t('Common.buttons.menu');
  }, [location, t]);

  const isAdvancedIssue = useMemo(() => {
    return location.pathname === ROUTES.ISSUE_ADVANCED_ISSUE;
  }, [location]);

  return (
    <Row className={cls.IssueCredential}>
      {isAdvancedIssue && (
        <BasicPanel
          title={t('IssueCredential.titles.advancedIssue')}
          icon="documents"
        />
      )}
      {!isAdvancedIssue && (
        <PanelWithMenu
          panelMenu={<IssueCredentialMenu />}
          title={t('IssueCredential.titles.main')}
          activeItem={activeItem}
        />
      )}
      <IssueCredentialRoutes />
    </Row>
  );
};

export default IssueCredential;
