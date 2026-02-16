export enum ROUTES {
  MAIN = '/',
  PROFILE = '/profile',
  SIGN_IN = '/sign-in',
  SIGN_UP = '/sign-up',
  DEMO = '/demo',
  ISSUE_CREDENTIAL = '/issue-credential/*',
  VERIFY_CREDENTIAL = '/verify-credential/*',
  VERIFICATION_REQUEST = '/verify-credential/verification-request',
  ADVANCED_VERIFICATION = '/verify-credential/advanced-verification',
  VERIFY_CREDENTIAL_TEMPLATES = '/verify-credential/templates',
  VERIFY_CREDENTIAL_FROM_TEMPLATE = '/verify-credential/from-template',
  CREDENTIAL_OFFER = '/issue-credential/credential-offer',
  ISSUE_CREDENTIAL_TEMPLATES = '/issue-credential/templates',
  ISSUE_CREDENTIAL_SCHEMAS = '/issue-credential/schemas',
  ISSUE_CREDENTIAL_CREDENTIAL_DEFINITIONS = '/issue-credential/credential-definitions',
  ISSUE_CREDENTIAL_DIDS = '/issue-credential/dids',
  ISSUE_ADVANCED_ISSUE = '/issue-credential/advanced-issue',
  ISSUE_CREDENTIAL_FROM_TEMPLATE = '/issue-credential/from-template',
  ISSUE_TEMPLATE = '/issue-credential/template',
  VERIFY_TEMPLATE = '/verify-credential/template',
}

export default ROUTES;
