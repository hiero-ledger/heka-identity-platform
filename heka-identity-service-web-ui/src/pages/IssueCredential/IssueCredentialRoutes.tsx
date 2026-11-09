import { Route, Routes } from 'react-router-dom';

import { IssueFromTemplate } from '@/pages/IssueCredential/IssueFromTemplate/IssueFromTemplate';
import { features } from '@/shared/config/features';

import { AdvancedIssue } from './AdvancedIssue/AdvancedIssue';
import { IssuedCredentials } from './IssuedCredentials/IssuedCredentials';
import { IssueTemplates } from './IssueTemplates/IssueTemplates';
import { Schemas } from './Schemas/Schemas';

export const IssueCredentialRoutes = () => {
  return (
    <Routes>
      <Route
        path="templates"
        element={<IssueTemplates />}
      />
      <Route
        path="schemas"
        element={<Schemas />}
      />
      <Route
        path="credential-definitions"
        element={<div>Credential definitions</div>}
      />
      <Route
        path="dids"
        element={<div>DIDs</div>}
      />
      {features.revocation && (
        <Route
          path="issued-credentials"
          element={<IssuedCredentials />}
        />
      )}
      <Route
        path="advanced-issue"
        element={<AdvancedIssue type={'issue'} />}
      />
      <Route
        path="issue-from-template"
        element={<IssueFromTemplate />}
      />
      <Route
        path="template"
        element={<AdvancedIssue type={'template'} />}
      />
    </Routes>
  );
};
