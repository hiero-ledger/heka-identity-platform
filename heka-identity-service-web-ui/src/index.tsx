import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import '@/app/styles/index.scss';
import { StoreProvider } from '@/app/providers/StoreProvider';

import './translations';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Container not found');
}

const root = createRoot(container);

root.render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
