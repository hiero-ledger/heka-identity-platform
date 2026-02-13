import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import CircularDependencyPlugin from 'circular-dependency-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import Dotenv from 'dotenv-webpack';
import HTMLWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';

import { BuildOptions } from './types/config';

export function buildPlugins(
  options: BuildOptions,
): webpack.WebpackPluginInstance[] {
  const { paths, isDev, apiUrl, project } = options;
  const isProd = !isDev;

  const plugins = [
    new HTMLWebpackPlugin({
      title: options.title,
      template: paths.html,
      favicon: paths.favicon,
    }),
    new webpack.ProgressPlugin(),
    new webpack.DefinePlugin({
      __IS_DEV__: JSON.stringify(isDev),
      __API__: JSON.stringify(apiUrl),
      __PROJECT__: JSON.stringify(project),
    }),
    new CircularDependencyPlugin({
      exclude: /node_modules/,
      failOnError: true,
    }),
    new Dotenv(),
    new CopyPlugin({
      patterns: [{ from: paths.defaultSchemaLogo, to: paths.build }],
    }),
  ];

  if (isDev) {
    plugins.push(new ReactRefreshWebpackPlugin());
    plugins.push(new webpack.HotModuleReplacementPlugin());
    /**
     * Not need to run it every build
     */
    // plugins.push(
    //   new BundleAnalyzerPlugin({
    //     openAnalyzer: false,
    //   }),
    // );
  }

  if (isProd) {
    plugins.push(
      new MiniCssExtractPlugin({
        filename: 'css/[name].[contenthash:8].css',
        chunkFilename: 'css/[name].[contenthash:8].css',
      }),
    );
  }

  return plugins;
}
