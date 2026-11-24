import js from '@eslint/js'
import importX from 'eslint-plugin-import-x'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Mirrors heka-identity-service-web-ui/eslint.config.mjs (hooks, import order) without the rules
// for what this package doesn't have (Redux, router, Storybook, SCSS). Prettier runs as a rule,
// as in heka-identity-service and heka-wallet.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.yarn/**', 'src/credo/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Puppeteer runs the callbacks of evaluate() and waitForFunction() in the pages.
    files: ['e2e/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, chrome: 'readonly' },
    },
  },
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    plugins: {
      'import-x': importX,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'internal', 'external', ['sibling', 'parent'], 'index', 'unknown'],
          pathGroups: [
            { pattern: '@/**/**', group: 'parent', position: 'before' },
            { pattern: '@*/**', group: 'external' },
            { pattern: '*/**', group: 'external' },
          ],
          pathGroupsExcludedImportTypes: [],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  prettierRecommended,
)
