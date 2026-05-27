const fs = require('fs')
const path = require('path')
const escape = require('escape-string-regexp')

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

const exclusionList = (additionalExclusions = []) => {
  const defaults = [/\/__tests__\/.*/]

  const escapeRegExp = (pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.source.replace(/\/|\\\//g, `\\${path.sep}`)
    }
    if (typeof pattern === 'string') {
      const escaped = pattern.replace(/[\-\[\]\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')
      return escaped.replaceAll('/', `\\${path.sep}`)
    }
    throw new Error(`Expected exclusionList to be called with RegExp or string, got: ${typeof pattern}`)
  }

  return new RegExp(`(${additionalExclusions.concat(defaults).map(escapeRegExp).join('|')})$`)
}

const projectDir = __dirname
const workspaceDir = path.join(projectDir, '../')

const nodeModulesDir = path.join(workspaceDir, 'node_modules')

// Resolve the single canonical copy of @peculiar/asn1-schema at config load time.
// Multiple nested copies (2.3.8) exist under @credo-ts/core, @peculiar/x509,
// webcrypto-core, and @peculiar/webcrypto. They each get a separate AsnSchemaStorage
// instance causing "Cannot get schema for 'Certificate' target" during mDL validation.
const asn1SchemaEntry = require.resolve('@peculiar/asn1-schema', { paths: [workspaceDir] })

const packageDirs = [
  fs.realpathSync(path.join(nodeModulesDir, '@bifold/oca')),
  fs.realpathSync(path.join(nodeModulesDir, '@bifold/core')),
  fs.realpathSync(path.join(nodeModulesDir, '@bifold/verifier')),
]

const watchFolders = [...packageDirs, workspaceDir]

const extraExclusionList = []
const extraNodeModules = {}

for (const packageDir of packageDirs) {
  const pak = require(path.join(packageDir, 'package.json'))
  const modules = Object.keys({
    ...pak.peerDependencies,
    ...pak.devDependencies,
  })
  extraExclusionList.push(...modules.map((m) => path.join(packageDir, 'node_modules', m)))

  modules.reduce((acc, name) => {
    acc[name] = path.join(nodeModulesDir, name)
    return acc
  }, extraNodeModules)
}

const defaultConfig = getDefaultConfig(projectDir)
const {
  resolver: { sourceExts, assetExts },
} = defaultConfig

const combinedWatchFolders = Array.from(new Set([...(defaultConfig.watchFolders || []), ...watchFolders]))

const config = mergeConfig(defaultConfig, {
  projectRoot: projectDir,
  /*resetCache: true,*/
  transformer: {
    ...defaultConfig.transformer,
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    minifierPath: 'metro-minify-terser',
    minifierConfig: {
      keep_classnames: true,
      keep_fnames: true,
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
      },
      // Remove console logs from production
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
        pure_funcs: ['console.log'],
      },
    },
  },
  resolver: {
    ...defaultConfig.resolver,
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'browser', 'require'],
    blacklistRE: exclusionList([
      ...extraExclusionList.map((m) => new RegExp(`^${escape(m)}\\/.*$`)),
      // Block all nested copies of @peculiar/asn1-schema so only the workspace-root
      // version (2.3.13) is bundled — prevents split AsnSchemaStorage instances.
      new RegExp(`^${escape(path.join(nodeModulesDir, '@credo-ts/core/node_modules/@peculiar/asn1-schema'))}\\/.*$`),
      new RegExp(`^${escape(path.join(nodeModulesDir, '@peculiar/x509/node_modules/@peculiar/asn1-schema'))}\\/.*$`),
      new RegExp(`^${escape(path.join(nodeModulesDir, 'webcrypto-core/node_modules/@peculiar/asn1-schema'))}\\/.*$`),
      new RegExp(
        `^${escape(path.join(nodeModulesDir, '@peculiar/webcrypto/node_modules/@peculiar/asn1-schema'))}\\/.*$`
      ),
    ]),
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@peculiar/asn1-schema') {
        // Directly return the workspace-root version — bypasses Metro's default
        // hierarchical node_modules lookup which would find nested copies first.
        return { filePath: asn1SchemaEntry, type: 'sourceFile' }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg', 'cjs'],
    extraNodeModules: {
      ...(defaultConfig.resolver.extraNodeModules || {}),
      ...extraNodeModules,
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
  watchFolders: combinedWatchFolders,
})

module.exports = config
