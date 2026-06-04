const presets = ['module:@react-native/babel-preset']
const plugins = [
  [
    'module-resolver',
    {
      extensions: ['.tsx', '.ts', '.js', '.jsx', '.json', '.mjs'],
    },
  ],
  ['@babel/plugin-proposal-decorators', { legacy: true }],
  ['@babel/plugin-transform-export-namespace-from'],
]

// react-native-paper/babel rewrites imports into the package's ESM-only
// lib/module/* tree, which Jest's transformIgnorePatterns don't cover.
// It's a Metro tree-shaking optimization — skip it under Jest.
if (process.env['NODE_ENV'] !== 'test') {
  plugins.push(['react-native-paper/babel'])
}

plugins.push(['react-native-reanimated/plugin']) // must remain last

if (process.env['ENV'] === 'prod') {
  plugins.push('transform-remove-console')
}

module.exports = {
  presets,
  plugins,
}
