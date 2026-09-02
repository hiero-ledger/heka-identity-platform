import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.scss'
import App from './App.tsx'
import AppAuthProvider from './auth/AppAuthProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppAuthProvider>
      <App />
    </AppAuthProvider>
  </StrictMode>,
)
