import React from 'react';
import { Route, Routes } from 'react-router-dom';

import { VerificationFromTemplate } from '@/pages/VerifyCredential/VerificationFromTemplate/VerificationFromTemplate';

import AdvancedVerification from './AdvancedVerification/AdvancedVerification';
import { VerificationTemplates } from './VerificationTemplates/VerificationTemplates';

export const VerifyCredentialRoutes = () => {
  return (
    <Routes>
      <Route
        path="templates"
        element={<VerificationTemplates />}
      />
      <Route
        path="advanced-verification"
        element={<AdvancedVerification type={'issue'} />}
      />
      <Route
        path="verify-from-template"
        element={<VerificationFromTemplate />}
      />
      <Route
        path="template"
        element={<AdvancedVerification type={'template'} />}
      />
    </Routes>
  );
};
