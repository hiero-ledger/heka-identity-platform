# Heka Identity Wallet

This folder contains Heka Identity Wallet based on [OWF Bifold](https://github.com/openwallet-foundation/bifold-wallet) and [DSR SSI Toolkit](https://en.dsr-corporation.com/news/decentralized-digital-wallet-and-toolkit/).

This wallet serves as a reference implementation of identity mobile wallet that supports Hiero/Hedera DID and AnonCreds Method, leveraging [Hedera module for OWF Credo](https://github.com/openwallet-foundation/credo-ts/tree/main/packages/hedera).
To explore and test Heka Wallet features, you can use [public DSR Agency Demo](https://ssi-agency.dsr-corporation.com) or deploy Heka Identity Service locally.

The project is a monorepo that contains [main app](./app) and separate [feature packages](./packages) that enable modular architecture.

## Install dependencies

```
yarn install
```

### Additional step for iOS - install native dependencies (CocoaPods)
```
cd app/ios
pod install
```

## Run checks

- TypeScript check
```shell
yarn typecheck
```

- ESLint
```shell
yarn lint
```

- Tests
```shell
yarn test
```

## Run the app

Note that it's strongly recommended to use a physical device instead of emulator.

#### Android 
```shell
yarn run:android
```

#### iOS

Requires MacOS with installed XCode (including iOS SDK version compatible with the device).
Please note that you may need to configure XCode project for your environment (personal developer account for signing, etc.).

```shell
yarn run:ios 
```

## Create app bundle

### Android

- It's recommended to use GitHub CI/CD pipelines to create app bundles
- Currently, both debug and release build require `VERSION` environment variable to be set
  - See version-related scripts in [app package.json](./app/package.json)
- For release build you need to provide a keystore for Google Play upload. This can be done via following environment variables:
  - `UPLOAD_KEYSTORE_PATH`
  - `UPLOAD_KEYSTORE_PASSWORD`
  - `UPLOAD_KEY_ALIAS`
  - `UPLOAD_KEY_PASSWORD`

#### Scripts
- Bundle debug
```shell
yarn bundle-app:android:debug
```

- Bundle release
```shell
yarn bundle-app:android:release
```

### iOS

- It's recommended to use XCode to build and distribute iOS bundles
- To sign bundles, you must be added to Apple Development team and granted access to the app
- iOS bundles can be created manually by using `Product -> Archive` command in XCode
  - See [related XCode docs section](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases#Create-an-archive-of-your-app)
  - You can change build configuration (release/debug) for archiving the app (using `Edit scheme` option for app target)
  - App bundle (archive) created in XCode can be validated to meet distribution requirements or distributed right away (`Distribute App` and `Validate App` options in an archive list)
  - Please note that for internal TestFlight-only builds you need to use `Custom` validation/distribution settings and check `TestFlight internal testing only`

#### Bundle for development

Development bundle can be created and signed using Development Provision profile created by XCode automated signing.

See [Distributing your app to registered devices](http://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)

#### Bundle for App Store/TestFlight distribution

To sign bundles for App Store/TestFlight distribution, you'll need to import a provisioning key, certificate and profile:
1. Create or get corresponding files from your Apple Developer account/team
   - `.p12` file - private key used for signing
   - `.cer` file - public distribution certificate
   - `.mobileprovision` file - provisioning profile
2. Import key and certificate into you MacOS Keychain (should work out-of-box since `Keychain Access` app is used to open `.p12` and `.cer` files by default)
3. In XCode, find `Signing (Release)` setting in app target, select `Import profile...` option and choose app `.mobileprovision` file
4. Make sure that you're able to create a release app bundle using `Archive` command in XCode
 