import { BuildOptions } from '../types/config';

export function buildBabelLoader({ isDev }: BuildOptions) {
  return {
    test: /\.(js|mjs|jsx|tsx)$/,
    exclude: /node_modules/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-env'],
        plugins: [isDev && require.resolve('react-refresh/babel')].filter(
          Boolean,
        ),
      },
    },
  };
}
