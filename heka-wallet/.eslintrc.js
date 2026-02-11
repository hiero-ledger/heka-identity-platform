module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: [
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // React/React Native specific rules
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react-native/all',
    'plugin:prettier/recommended',
    'prettier',
  ],
  settings: {
    react: {
      version: '18.2.0',
    },
    componentWrapperFunctions: [
      // The name of any function used to wrap components, e.g. Mobx `observer` function. If this isn't set, components wrapped by these functions will be skipped.
      { property: 'observer', object: 'Mobx' },
    ],
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
    'import/resolver': {
      typescript: {},
    },
  },
  plugins: ['@typescript-eslint', 'import', 'react', 'react-hooks', 'react-native'],
  rules: {
    'no-console': 'warn',
    // TODO: Consider to enable errors for explicit any (will require refactoring and manual '@ts-ignore' for some places)
    '@typescript-eslint/no-explicit-any': 'warn',
    // Because of early development, we only warn on ts-ignore. In future, we want to move to error
    '@typescript-eslint/ban-ts-comment': 'warn',
    // Aries protocols define attributes with snake case.
    '@typescript-eslint/camelcase': 'off',
    // Type is enforced by callers, which is good enough.
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'import/order': [
      'error',
      {
        groups: ['type', ['builtin', 'external'], 'parent', 'sibling', 'index'],
        alphabetize: {
          order: 'asc',
        },
        'newlines-between': 'always',
      },
    ],
    'import/no-cycle': 'error',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: false,
      },
    ],
    'react-hooks/exhaustive-deps': 'error',
    'react/no-unescaped-entities': 'warn',
    'react/prop-types': 'off', // Prop type validation provided by TS is sufficient
    'react-native/no-raw-text': 'warn',
    'react-native/no-color-literals': 'off',
    'react-native/no-inline-styles': 'off',
    'react-native/sort-styles': 'off',
    // This rule is not optimized for React functional components and quite bugged. See:
    // https://github.com/Intellicode/eslint-plugin-react-native/issues/241
    // https://github.com/Intellicode/eslint-plugin-react-native/issues/166
    'react-native/no-unused-styles': 'off',
  },
  globals: {
    require: true,
  },
  overrides: [
    {
      files: ['*.test.*'],
      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['.eslintrc.js', '**/*.config.js'],
      env: {
        node: true,
      },
    },
  ],
}
