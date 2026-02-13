import path from 'path';

import { buildWebpackConfig } from './config/build/buildWebpackConfig';
import { BuildEnv, BuildPaths } from './config/build/types/config';

export default (env: BuildEnv | undefined) => {
  const paths: BuildPaths = {
    entry: path.resolve(__dirname, 'src', 'index.tsx'),
    build: path.resolve(__dirname, 'build'),
    html: path.resolve(__dirname, 'public', 'index.html'),
    favicon: path.resolve(__dirname, 'public', 'favicon.svg'),
    defaultSchemaLogo: path.resolve(
      __dirname,
      'public',
      'default-schema-avatar.png',
    ),
    src: path.resolve(__dirname, 'src'),
  };

  const mode = env?.mode || 'development';
  const PORT = env?.port || 3000;
  const apiUrl = env?.apiUrl || 'http://localhost:8000';
  const appName = env?.appName || 'Heka Identity Service';

  const isDev = mode === 'development';

  return buildWebpackConfig({
    mode,
    paths,
    isDev,
    port: PORT,
    apiUrl,
    project: 'frontend',
    title: appName,
  });
};
