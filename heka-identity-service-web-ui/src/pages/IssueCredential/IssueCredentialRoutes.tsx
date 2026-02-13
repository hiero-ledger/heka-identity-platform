import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { IssueFromTemplate } from '@/pages/IssueCredential/IssueFromTemplate/IssueFromTemplate';

import { AdvancedIssue } from './AdvancedIssue/AdvancedIssue';
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
      <Route
        path="issued-credentials"
        element={<div>Issued credentials</div>}
      />
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
