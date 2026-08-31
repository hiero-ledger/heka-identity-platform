import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
  // svgr: `import Icon from './icon.svg?react'` yields a React component
  // (identity-service's @svgr/webpack convention); a plain `.svg` import stays
  // a URL for <img>/favicon use.
  plugins: [react(), svgr()],
  server: {
    // Listen on all interfaces (not just ::1) so `adb reverse tcp:5173 tcp:5173`
    // can reach the dev server over IPv4 loopback for on-device testing.
    host: true,
  },
})
