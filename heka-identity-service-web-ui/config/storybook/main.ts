import path from 'path';

import type { StorybookConfig } from '@storybook/react-webpack5';
import { Configuration, DefinePlugin, RuleSetRule } from 'webpack';

import { buildCssLoader } from '../build/loaders/buildCssLoader';
import { BuildPaths } from '../build/types/config';

const config: StorybookConfig = {
  stories: ['../../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-webpack5-compiler-swc',
    '@storybook/addon-onboarding',
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@chromatic-com/storybook',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  swc: () => ({
    jsc: {
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  }),
  webpackFinal: async (config: Configuration) => {
    const paths: BuildPaths = {
      build: '',
      html: '',
      favicon: '',
      defaultSchemaLogo: '',
      entry: '',
      src: path.resolve(__dirname, '..', '..', 'src'),
    };
    config!.resolve!.modules!.push(paths.src);
    config!.resolve!.extensions!.push('.ts', '.tsx');
    config!.resolve!.alias = {
      ...config!.resolve!.alias,
      '@': paths.src,
    };

    config!.module!.rules = config!.module!.rules!.map(
      // @ts-ignore
      (rule: RuleSetRule) => {
        if (/svg/.test(rule.test as string)) {
          return { ...rule, exclude: /\.svg$/i };
        }

        return rule;
      },
    );

    config!.module!.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    config!.module!.rules!.push(buildCssLoader(true));

    config!.plugins!.push(
      new DefinePlugin({
        __IS_DEV__: JSON.stringify(true),
        __API__: JSON.stringify(''),
        __PROJECT__: JSON.stringify('storybook'),
      }),
    );
    // Return the altered config
    return config;
  },
};
export default config;
