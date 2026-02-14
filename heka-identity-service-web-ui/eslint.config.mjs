import { fixupPluginRules } from '@eslint/compat';
import pluginJs from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import pluginJsxA11y from 'eslint-plugin-jsx-a11y';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginStorybook from 'eslint-plugin-storybook';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
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
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginJsxA11y.flatConfigs.recommended,
  {
    plugins: {
      'react-hooks': fixupPluginRules(pluginReactHooks),
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
  {
    plugins: {
      import: fixupPluginRules(pluginImport),
    },
    rules: {
      'import/order': [
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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
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
      'import/no-anonymous-default-export': 'off',
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
