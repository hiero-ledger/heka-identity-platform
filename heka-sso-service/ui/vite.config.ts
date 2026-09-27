import { defineConfig } from 'vite'

/**
 * The wallet login page build. Output goes straight into the service's build output, `dist/oidc/pages/ui/`.
 */
export default defineConfig({
  base: '/interaction/assets/',
  build: {
    outDir: '../dist/oidc/pages/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: 'login.html',
      output: {
        entryFileNames: 'login.js',
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? ''
          return name.endsWith('.css') ? 'styles.css' : '[name][extname]'
        },
      },
    },
  },
})
