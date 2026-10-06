import ROUTES from '@/app/routes/RoutePaths';
import i18next from '@/translations';

export const USER_ID = 'did';

export const panelIssuanceMenuItems = [
  {
    title: i18next.t('IssueCredential.menuItemNames.templates'),
    route: ROUTES.ISSUE_CREDENTIAL_TEMPLATES,
  },
  {
    title: i18next.t('IssueCredential.menuItemNames.schemas'),
    route: ROUTES.ISSUE_CREDENTIAL_SCHEMAS,
  },
];

export const panelVerificationMenuItems = [
  {
    title: i18next.t('VerifyCredential.menuItemNames.templates'),
    route: ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
  },
];
