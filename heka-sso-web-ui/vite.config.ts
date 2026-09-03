import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        replaceAttrValues: {
          '#F18D00': 'currentColor',
          '#2E2721': 'currentColor',
          black: 'currentColor',
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
