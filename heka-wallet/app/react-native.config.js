module.exports = {
  assets: ['./src/assets/fonts'],
  dependencies: {
    // React Native Firebase is set up for Android only (DSRDSC-287); the iOS setup
    // (static frameworks, FirebaseApp.configure, GoogleService-Info.plist) is a follow-up.
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/messaging': { platforms: { ios: null } },
  },
}
