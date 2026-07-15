import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReactNative from 'eslint-plugin-react-native';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/android/**',
      '**/ios/**',
      '**/.yarn/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'app/shim.js',
      'app/metro.config.js',
      'app/versionUtils.js',
      '**/jest.config.js',
      '**/jest.config-base.js',
      '**/jest.setup.js',
      'jest-helpers/**',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  // eslint-plugin-react still calls ESLint <10 context APIs; fixup shims them.
  ...fixupConfigRules(pluginReact.configs.flat.recommended),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: 'readonly',
        require: 'readonly',
      },
    },
    settings: {
      react: {
        version: '18.2.0',
      },
      // The name of any function used to wrap components, e.g. Mobx `observer` function.
      componentWrapperFunctions: [{ property: 'observer', object: 'Mobx' }],
      'import-x/resolver': {
        typescript: {},
      },
    },
    plugins: {
      'react-hooks': pluginReactHooks,
      // eslint-plugin-react-native is legacy (no flat export, ESLint <10 APIs); fixup shims it.
      'react-native': fixupPluginRules(pluginReactNative),
    },
    rules: {
      ...pluginReactNative.configs.all.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'warn',
      // TODO: Consider to enable errors for explicit any (will require refactoring and manual '@ts-ignore' for some places)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Because of current stage in development, we only warn on ts-ignore. In future, we want to move to error
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Type is enforced by callers, which is good enough.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // React Native uses require() for static assets (images/fonts); keep allowed.
      '@typescript-eslint/no-require-imports': 'off',
      // New/stricter under ESLint 10 + typescript-eslint v8; kept as warnings so the
      // upgrade does not introduce new blocking rules. Tracked for incremental cleanup.
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-useless-assignment': 'warn',
      // Deep credo-ts subpath imports (.../build/...) the TS resolver cannot follow.
      'import-x/no-unresolved': 'warn',
      'import-x/order': [
        'error',
        {
          groups: ['type', ['builtin', 'external'], 'parent', 'sibling', 'index'],
          alphabetize: {
            order: 'asc',
          },
          'newlines-between': 'always',
        },
      ],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: false,
        },
      ],
      'react/no-unescaped-entities': 'warn',
      'react/prop-types': 'off', // Prop type validation provided by TS is sufficient
      'react-native/no-raw-text': ['warn', { skip: ['ThemedText'] }],
      'react-native/no-color-literals': 'off',
      'react-native/no-inline-styles': 'off',
      'react-native/sort-styles': 'off',
      // This rule is not optimized for React functional components and quite bugged. See:
      // https://github.com/Intellicode/eslint-plugin-react-native/issues/241
      // https://github.com/Intellicode/eslint-plugin-react-native/issues/166
      'react-native/no-unused-styles': 'off',
    },
  },
  {
    // KeplrStore is a plain class; CosmosQueries.use()/CosmosAccount.use() etc. are
    // Cosmos store accessor methods, not React hooks. react-hooks v7 misflags them.
    files: ['packages/keplr/src/KeplrStore.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  prettierRecommended,
);
