import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import AuthenticatedLayout from '@/components/Layout/AuthenticatedLayout';
import UnauthenticatedLayout from '@/components/Layout/UnauthenticatedLayout';
import { getUserIsSignedIn } from '@/entities/User/model/selectors/userSelector';
import Demo from '@/pages/Demo/Demo';
import Home from '@/pages/Home/Home';
import CredentialOffer from '@/pages/IssueCredential/CredentialOffer/CredentialOffer';
import IssueCredential from '@/pages/IssueCredential/IssueCredential';
import { IssueFromTemplate } from '@/pages/IssueCredential/IssueFromTemplate/IssueFromTemplate';
import Profile from '@/pages/Profile/Profile';
import SignInView from '@/pages/SignIn/SignIn';
import SignUpView from '@/pages/SignUp/SignUp';
import { VerificationFromTemplate } from '@/pages/VerifyCredential/VerificationFromTemplate/VerificationFromTemplate';
import VerificationRequest from '@/pages/VerifyCredential/VerificationRequest/VerificationRequest';
import VerifyCredential from '@/pages/VerifyCredential/VerifyCredential';

const AuthenticatedRoutes = () => (
  <Routes>
    <Route
      path="/"
      element={<AuthenticatedLayout />}
    >
      <Route
        index
        path={ROUTES.MAIN}
        element={<Home />}
      />
      <Route
        path={ROUTES.PROFILE}
        element={<Profile />}
      />
      <Route
        path={ROUTES.DEMO}
        element={<Demo />}
      />
      <Route
        path={ROUTES.ISSUE_CREDENTIAL}
        element={<IssueCredential />}
      />
      <Route
        path={ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE}
        element={<IssueFromTemplate />}
      />
      <Route
        path={ROUTES.CREDENTIAL_OFFER}
        element={<CredentialOffer />}
      />
      <Route
        path={ROUTES.VERIFY_CREDENTIAL}
        element={<VerifyCredential />}
      />
      <Route
        path={ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE}
        element={<VerificationFromTemplate />}
      />
      <Route
        path={ROUTES.VERIFICATION_REQUEST}
        element={<VerificationRequest />}
      />
      <Route
        path="*"
        element={<Navigate to={ROUTES.MAIN} />}
      />
    </Route>
  </Routes>
);

const UnauthenticatedRoutes = () => (
  <Routes>
    <Route element={<AuthenticatedLayout />}>
      <Route
        index
        path={ROUTES.MAIN}
        element={<Home />}
      />
      <Route
        path={ROUTES.DEMO}
        element={<Demo />}
      />
      <Route
        path="*"
        element={<Navigate to={ROUTES.MAIN} />}
      />
    </Route>
    <Route element={<UnauthenticatedLayout />}>
      <Route
        path={ROUTES.SIGN_IN}
        element={<SignInView />}
      />
      <Route
        path={ROUTES.SIGN_UP}
        element={<SignUpView />}
      />
    </Route>
  </Routes>
);

const Router = () => {
  const isSignedIn = useSelector(getUserIsSignedIn);

  const routes = useMemo(
    () => (isSignedIn ? <AuthenticatedRoutes /> : <UnauthenticatedRoutes />),
    [isSignedIn],
  );

  return <BrowserRouter>{routes}</BrowserRouter>;
};

export default Router;
