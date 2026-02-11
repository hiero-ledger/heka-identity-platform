const presets = ['module:metro-react-native-babel-preset']
const plugins = [
  [
    'module-resolver',
    {
      extensions: ['.tsx', 'ts', '.js', '.jsx', '.json'],
    },
  ],
  ['@babel/plugin-transform-flow-strip-types'],
  ['@babel/plugin-proposal-decorators', { legacy: true }],
  ['@babel/plugin-proposal-class-properties'],
  ['@babel/plugin-transform-private-methods'],
  ['react-native-paper/babel'],
  ['react-native-reanimated/plugin'],
]

if (process.env['ENV'] === 'prod') {
  plugins.push('transform-remove-console')
}

module.exports = {
  presets,
  plugins,
}
