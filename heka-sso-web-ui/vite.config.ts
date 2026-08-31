import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // `@/…` → `src/…` (identity-service's convention); mirrored in tsconfig.app.json `paths`.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // svgr: `import Icon from './icon.svg?react'` yields a React component
  // (identity-service's @svgr/webpack convention); a plain `.svg` import stays
  // a URL for <img>/favicon use. The copied icons carry identity-service's
  // brand fills; mapping them to `currentColor` lets the icons follow the
  // surrounding text color (tokens) while the SVG files stay verbatim copies.
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        replaceAttrValues: {
          '#F18D00': 'currentColor', // dashboard-outline — coloured back via --color-accent-nav
          '#2E2721': 'currentColor', // user (old primary)
          black: 'currentColor', // logout
        },
      },
    }),
  ],
  server: {
    // Listen on all interfaces (not just ::1) so `adb reverse tcp:5173 tcp:5173`
    // can reach the dev server over IPv4 loopback for on-device testing.
    host: true,
  },
})
