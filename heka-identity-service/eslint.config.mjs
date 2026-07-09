import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'migrations/**', 'indy-besu-vdr-pkg/**', '.yarn/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['asyncMethods'] }],
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      // Rules below were not error-level under the previous typescript-eslint v5 config
      // (no-explicit-any was a warning; the rest are new in v8/ESLint 10). They are kept
      // as warnings so this ESLint 10 migration preserves the prior blocking surface
      // rather than imposing a code overhaul. Tracked for incremental cleanup.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-duplicate-type-constituents': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/prefer-promise-reject-errors': 'warn',
      'no-useless-assignment': 'warn',
      'no-unassigned-vars': 'warn',
      'import-x/order': [
        'error',
        {
          groups: ['type', 'builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/__tests__/**/*',
            '**/__mocks__/**/*',
            'test/**/*',
            'vitest.config.mts',
            'eslint.config.mjs',
          ],
          peerDependencies: false,
          optionalDependencies: false,
        },
      ],
    },
  },
  {
    files: ['test/**/*', 'src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/__tests__/**/*', 'src/**/__mocks__/**/*'],
    rules: {
      '@typescript-eslint/unbound-method': 'warn',
    },
  },
  prettierRecommended,
);
