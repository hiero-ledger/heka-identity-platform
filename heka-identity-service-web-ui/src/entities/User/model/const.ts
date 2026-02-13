import ROUTES from '@/app/routes/RoutePaths';
import i18next from '@/translations';

export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
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
  // TODO: Restore when screens are ready
  // {
  //   title: i18next.t('IssueCredential.menuItemNames.credentialDefinitions'),
  //   route: ROUTES.ISSUE_CREDENTIAL_CREDENTIAL_DEFINITIONS,
  // },
  // {
  //   title: i18next.t('IssueCredential.menuItemNames.dids'),
  //   route: ROUTES.ISSUE_CREDENTIAL_DIDS,
  // },
];
export const panelVerificationMenuItems = [
  {
    title: i18next.t('VerifyCredential.menuItemNames.templates'),
    route: ROUTES.VERIFY_CREDENTIAL_TEMPLATES,
  },
];
