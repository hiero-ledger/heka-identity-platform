const fs = require('fs')
const path = require('path')
const escape = require('escape-string-regexp')

const projectDir = __dirname
const workspaceDir = path.join(projectDir, '../')

const nodeModulesDir = path.join(workspaceDir, 'node_modules')

const packageDirs = [
  fs.realpathSync(path.join(nodeModulesDir, '@hyperledger/aries-oca')),
  fs.realpathSync(path.join(nodeModulesDir, '@hyperledger/aries-bifold-core')),
  fs.realpathSync(path.join(nodeModulesDir, '@hyperledger/aries-bifold-verifier')),
]

const watchFolders = [...packageDirs, workspaceDir]

const extraExclusionlist = []
const extraNodeModules = {}

for (const packageDir of packageDirs) {
  const pak = require(path.join(packageDir, 'package.json'))
  const modules = Object.keys({
    ...pak.peerDependencies,
    ...pak.devDependencies,
  })
  extraExclusionlist.push(...modules.map((m) => path.join(packageDir, 'node_modules', m)))

  modules.reduce((acc, name) => {
    acc[name] = path.join(nodeModulesDir, name)
    return acc
  }, extraNodeModules)
}

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const {
  resolver: { sourceExts, assetExts },
} = getDefaultConfig()

const exclusionList = require('metro-config/src/defaults/exclusionList')

const config = {
  projectRoot: projectDir,
  /*resetCache: true,*/
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'browser', 'import', 'require'],
    blacklistRE: exclusionList(extraExclusionlist.map((m) => new RegExp(`^${escape(m)}\\/.*$`))),
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg', 'cjs'],
    extraNodeModules: {
      ...extraNodeModules,
      // TODO: Remove manual mapping for @ledgerhq packages once package exports support in RN become stable
      // According to RN devs, this will be the case after RN 0.73 release
      // See https://reactnative.dev/blog/2023/06/21/package-exports-support
      '@ledgerhq/devices': path.resolve(nodeModulesDir, '@ledgerhq/devices/lib-es'),
      '@ledgerhq/domain-service': path.resolve(nodeModulesDir, '@ledgerhq/domain-service/lib-es'),
      '@ledgerhq/cryptoassets': path.resolve(nodeModulesDir, '@ledgerhq/cryptoassets/lib-es'),
      '@ledgerhq/errors': path.resolve(nodeModulesDir, '@ledgerhq/errors/lib-es'),
      '@ledgerhq/evm-tools': path.resolve(nodeModulesDir, '@ledgerhq/evm-tools/lib-es'),
      '@ledgerhq/hw-app-eth': path.resolve(nodeModulesDir, '@ledgerhq/hw-app-eth/lib-es'),
      '@ledgerhq/hw-transport': path.resolve(nodeModulesDir, '@ledgerhq/hw-transport/lib-es'),
      '@ledgerhq/hw-transport-mocker': path.resolve(nodeModulesDir, '@ledgerhq/hw-transport-mocker/lib-es'),
      '@ledgerhq/hw-transport-webhid': path.resolve(nodeModulesDir, '@ledgerhq/hw-transport-webhid/lib-es'),
      '@ledgerhq/hw-transport-webusb': path.resolve(nodeModulesDir, '@ledgerhq/hw-transport-webusb/lib-es'),
      '@ledgerhq/live-network': path.resolve(nodeModulesDir, '@ledgerhq/live-network/lib-es'),
      '@ledgerhq/logs': path.resolve(nodeModulesDir, '@ledgerhq/logs/lib-es'),
      crypto: path.resolve(nodeModulesDir, 'react-native-quick-crypto'),
      buffer: path.resolve(nodeModulesDir, 'buffer'),
      stream: path.resolve(nodeModulesDir, 'stream-browserify'),
      string_decoder: path.resolve(nodeModulesDir, 'string_decoder'),
      path: path.resolve(nodeModulesDir, 'path-browserify'),
      http: path.resolve(nodeModulesDir, 'http-browserify'),
      https: path.resolve(nodeModulesDir, 'https-browserify'),
      os: path.resolve(nodeModulesDir, 'os-browserify'),
      url: path.resolve(nodeModulesDir, 'url'),
    },
  },
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Workaround for React Navigation assets resolution on Android (caused by monorepo setup)
        // See https://github.com/react-navigation/react-navigation/issues/9584
        if (/\/node_modules\/@react-navigation\/.+\/assets\/.+\.png\?.+$/.test(req.url)) {
          req.url = `/assets/../${req.url}`
        }

        return middleware(req, res, next)
      }
    },
  },
  watchFolders,
}

module.exports = mergeConfig(getDefaultConfig(projectDir), config)
