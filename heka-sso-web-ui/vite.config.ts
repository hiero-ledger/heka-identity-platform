import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces (not just ::1) so `adb reverse tcp:5173 tcp:5173`
    // can reach the dev server over IPv4 loopback for on-device testing.
    host: true,
  },
})
