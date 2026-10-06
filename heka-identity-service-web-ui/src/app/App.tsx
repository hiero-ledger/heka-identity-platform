import React, { memo } from 'react';
import { Toaster } from 'react-hot-toast';

import Router from '@/app/routes/Router';
import { Toast } from '@/components/Toast/Toast';
import { OidcAuthProvider } from '@/shared/auth/OidcAuthProvider';

export const App = memo(() => {
  return (
    <div className="app">
      <OidcAuthProvider>
        <Router />
      </OidcAuthProvider>
      <Toaster position="bottom-right">
        {(toast) => <Toast toast={toast} />}
      </Toaster>
    </div>
  );
});

App.displayName = 'App';
