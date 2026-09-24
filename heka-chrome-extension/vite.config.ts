import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, existsSync, renameSync } from 'fs';
import { join } from 'path';

/**
 * Vite config for the Heka Chrome Extension (Manifest V3).
 *
 * Entry points (one per Chrome context):
 *   - popup/index.html     → popup.html at project root (Vite HTML entry)
 *   - background/service-worker.js
 *   - content-scripts/heka-bridge.js
 *
 * Manifest V3 requirement: manifest.json and icons/ must be at dist/ root.
 * We handle this with a custom writeBundle Rollup plugin hook (no extra deps).
 */

/** Inline Rollup plugin that copies static assets into dist after the build. */
const copyExtensionAssets = () => ({
  name: 'copy-extension-assets',
  writeBundle() {
    // Copy manifest.json → dist/manifest.json
    copyFileSync(
      resolve(__dirname, 'manifest.json'),
      resolve(__dirname, 'dist/manifest.json'),
    );

    // Copy icons/ → dist/icons/  (skip silently if folder doesn't exist)
    const iconsDir = resolve(__dirname, 'icons');
    const distIconsDir = resolve(__dirname, 'dist/icons');
    if (existsSync(iconsDir)) {
      mkdirSync(distIconsDir, { recursive: true });
      for (const file of readdirSync(iconsDir)) {
        copyFileSync(join(iconsDir, file), join(distIconsDir, file));
      }
    }

    // Vite outputs the HTML entry as dist/popup.html (named after input file).
    // Chrome requires it at dist/popup/index.html (per manifest default_popup).
    const htmlSrc  = resolve(__dirname, 'dist/popup.html');
    const htmlDest = resolve(__dirname, 'dist/popup/index.html');
    mkdirSync(resolve(__dirname, 'dist/popup'), { recursive: true });
    renameSync(htmlSrc, htmlDest);

    console.log('✓ manifest.json, icons, and popup/index.html ready in dist/');
  },
});

export default defineConfig({
  plugins: [react(), copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        // popup.html is at project root so Vite processes it correctly
        // and outputs it to dist/popup/index.html via entryFileNames override
        popup: resolve(__dirname, 'popup.html'),
        'background/service-worker': resolve(
          __dirname,
          'src/background/service-worker.ts',
        ),
        'content-scripts/heka-bridge': resolve(
          __dirname,
          'src/content-scripts/heka-bridge.ts',
        ),
      },
      output: {
        // Match the paths that manifest.json references exactly
        entryFileNames: (chunk) => {
          if (chunk.name === 'popup') return 'popup/index.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
          // CSS for the popup → popup/index.css
          if (asset.name === 'popup.css') return 'popup/index.css';
          return 'assets/[name].[ext]';
        },
      },
    },
    // Chrome loads each context independently; no benefit from modulePreload.
    modulePreload: false,
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
