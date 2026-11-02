import { memo } from 'react';
import { Toaster } from 'react-hot-toast';

import Router from '@/app/routes/Router';
import { Toast } from '@/components/Toast/Toast';
import { OidcAuthProvider } from '@/shared/auth/OidcAuthProvider';
import { NotificationsConnector } from '@/shared/lib/notifications';

export const App = memo(() => {
  return (
    <div className="app">
      <OidcAuthProvider>
        <NotificationsConnector />
        <Router />
      </OidcAuthProvider>
      <Toaster position="bottom-right">
        {(toast) => <Toast toast={toast} />}
      </Toaster>
    </div>
  );
});

App.displayName = 'App';
