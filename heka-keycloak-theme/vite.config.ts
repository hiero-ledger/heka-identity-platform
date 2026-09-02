import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { keycloakify } from 'keycloakify/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    keycloakify({
      themeName: 'heka',
      accountThemeImplementation: 'none',
      // Overridable per deployment from the Keycloak admin console
      // (Realm settings → Themes) or realm export; used by the identity
      // line under the login card.
      environmentVariables: [{ name: 'HEKA_APP_NAME', default: 'CivicTrust Demo' }],
    }),
  ],
})
