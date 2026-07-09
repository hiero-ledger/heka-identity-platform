import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginStorybook from 'eslint-plugin-storybook';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'build/**', '.yarn/**', 'eslint.config.mjs'],
  },
  { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // eslint-plugin-react and jsx-a11y still call ESLint <10 context APIs
  // (e.g. context.getFilename); fixup shims them onto the ESLint 10 API.
  ...fixupConfigRules(pluginReact.configs.flat.recommended),
  ...fixupConfigRules(pluginJsxA11y.flatConfigs.recommended),
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
          groups: [
            'builtin', // Built-in imports (come from NodeJS native) go first
            'internal', // <- Absolute imports
            'external', // <- External imports
            ['sibling', 'parent'], // <- Relative imports, the sibling and parent types they can be mingled together
            'index', // <- index imports
            'unknown', // <- unknown
          ],
          pathGroups: [
            {
              pattern: '@/**/**',
              group: 'parent',
              position: 'before',
            },
            {
              pattern: '@*/**',
              group: 'external',
            },
            {
              pattern: '*/**',
              group: 'external',
            },
            {
              pattern: './*.{css,scss}',
              group: 'sibling',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: [],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  {
    rules: {
      'jsx-a11y/no-static-element-interactions': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'react/display-name': 1,
      'react/react-in-jsx-scope': 0,
      'react/require-default-props': 0,
      'react/function-component-definition': 0,
      'react/no-unstable-nested-components': 1,
      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // New in ESLint 10's recommended set; kept as a warning so the version bump
      // does not introduce a new blocking rule. Tracked for incremental cleanup.
      'preserve-caught-error': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-undef': 0,
      'no-unused-vars': 0,
      'no-shadow': 0,
      'no-underscore-dangle': 0,
      'no-param-reassign': 0,
      'arrow-body-style': 0,
    },
  },

  // Storybook
  {
    plugins: {
      storybook: fixupPluginRules(pluginStorybook),
    },
  },
  {
    files: [
      '**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)',
      '**/*.story.@(ts|tsx|js|jsx|mjs|cjs)',
    ],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'import-x/no-anonymous-default-export': 'off',
      'storybook/await-interactions': 'error',
      'storybook/context-in-play-function': 'error',
      'storybook/default-exports': 'error',
      'storybook/hierarchy-separator': 'warn',
      'storybook/no-redundant-story-name': 'warn',
      'storybook/prefer-pascal-case': 'warn',
      'storybook/story-exports': 'error',
      'storybook/use-storybook-expect': 'error',
      'storybook/use-storybook-testing-library': 'error',
    },
  },
  {
    files: ['storybook/main.@(js|cjs|mjs|ts)'],
    rules: {
      'storybook/no-uninstalled-addons': 'error',
    },
  },
];
