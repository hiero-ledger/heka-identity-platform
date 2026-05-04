# Heka Wallet

This folder contains Heka Wallet based on [OWF Bifold](https://github.com/openwallet-foundation/bifold-wallet) and [DSR SSI Toolkit](https://en.dsr-corporation.com/news/decentralized-digital-wallet-and-toolkit/).

This wallet serves as a reference implementation of identity mobile wallet that supports Hiero/Hedera DID and AnonCreds Method, leveraging [Hedera module for OWF Credo](https://github.com/openwallet-foundation/credo-ts/tree/main/packages/hedera).
To explore and test Heka Wallet features, you can use [public DSR Agency Demo](https://ssi-agency.dsr-corporation.com) or deploy Heka Identity Service locally.

The project is a monorepo that contains [main app](./app) and separate [feature packages](./packages) that enable modular architecture.

## Capabilities

Heka Wallet acts as a Verifiable Credentials Holder — it receives, stores, and presents credentials.

- **Credential formats:** IETF SD-JWT VC, Hyperledger AnonCreds (legacy Indy and W3C representations).
- **Issuance protocols:** OpenID4VCI, DIDComm v2 (Aries Issue Credential v2).
- **Presentation protocols:** OpenID4VP, DIDComm v2 (Aries Present Proof v2).
- **DID methods — create:** `did:key`, `did:peer`, `did:jwk`, `did:hedera`.
- **DID methods — resolve:** `did:web`, `did:key`, `did:peer`, `did:jwk`, `did:hedera`, `did:indybesu`.
- **Mediation:** DIDComm message pickup via a configurable mediator.
- **Optional integrations (feature-flagged):**
  - Passkey-based wallet backup (`ENABLE_WALLET_BACKUP`).
  - External OAuth-based authentication (`ENABLE_EXTERNAL_AUTH`).
  - Public DIDComm invitation (`ENABLE_PUBLIC_INVITATION`).
  - Keplr / Cosmos chain integration (`ENABLE_KEPLR_INTEGRATION`) — experimental.

## Prerequisites

- **Node.js** — version that supports Corepack (Node 20+ recommended).
- **Yarn 4** via Corepack — this monorepo pins `yarn@4.9.4` in `package.json`. Enable Corepack so the correct Yarn version runs automatically:

  ```bash
  corepack enable
  corepack prepare yarn@4.9.4 --activate
  ```

  Without this, the system Yarn 1.x may run instead and produce unexpected lockfile behavior.

- **Android**: Android Studio with the Android SDK plus an emulator or a physical Android device.
- **iOS**: macOS with Xcode (matching iOS SDK for the target device) and CocoaPods.
- A reachable **Heka Identity Service** (or compatible backend) for issuance / verification flows. See the [Identity Service setup guide](../heka-identity-service/docs/setup.md). To expose a local instance to a wallet running on a phone, see [Local Configuration for Heka Wallet Integration](../heka-identity-service/docs/local-config-for-heka-wallet-integration.md).

> First `yarn install` pulls Credo, AnonCreds, and React Native native dependencies. Expect 5–10 minutes and ~1.5 GB on disk.

## Install Dependencies

```
yarn install
```

### Additional Step for iOS — Install Native Dependencies (CocoaPods)
```
cd app/ios
pod install
```

## Configuration

The wallet is configured via environment variables loaded by [`react-native-config`](https://github.com/luggit/react-native-config). Set them in an `.env` file at the wallet root (`heka-wallet/app/.env`) before running the app.

> **Note on defaults.** Several variables fall back to **shared development values** committed in source — most notably the Hedera operator key, the Indy Besu signing key and RPC URL, and the agency / backup endpoint URLs. These defaults are convenient for local exploration but **must be replaced** for any non-trivial use, especially when handling credentials with real-world value.

### DIDComm

| Variable       | Required    | Default   | Description                                                                  |
|----------------|-------------|-----------|------------------------------------------------------------------------------|
| `MEDIATOR_URL` | Recommended | _(unset)_ | DIDComm mediator invitation URL. Required for inbound DIDComm in production. |

### Hedera

| Variable              | Default                   | Description                                                                        |
|-----------------------|---------------------------|------------------------------------------------------------------------------------|
| `HEDERA_OPERATOR_ID`  | _(committed dev account)_ | Hedera testnet operator account ID (`0.0.<num>`). **Replace for non-trivial use.** |
| `HEDERA_OPERATOR_KEY` | _(committed dev key)_     | DER-encoded Ed25519 operator private key. **Replace for non-trivial use.**         |

See the [Hedera Integration guide](../heka-identity-service/docs/hedera.md) for guidance on obtaining your own operator credentials.

### Backup and Agency Endpoints

| Variable              | Default                                                | Description                                                                                                                        |
|-----------------------|--------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `WALLET_PROVIDER_URL` | `https://backup.ssi-agency.dsr-corporation.com/api/v1` | Wallet backup endpoint. The default points to a third-party hosted instance — replace with your own deployment for production use. |
| `AGENCY_PROVIDER_URL` | `https://api.ssi-agency.dsr-corporation.com`           | Default agency endpoint for issuance / verification flows. Same caveat as above.                                                   |

### Indy Besu

| Variable                                       | Default                      | Description                                                                                                 |
|------------------------------------------------|------------------------------|-------------------------------------------------------------------------------------------------------------|
| `INDY_BESU_RPC_URL`                            | `http://192.168.1.145:8545/` | EVM RPC endpoint. The committed default is a development LAN address — set explicitly for any deployed use. |
| `INDY_BESU_DID_REGISTRY_CONTRACT_ADDRESS`      | `0x…3333`                    | DID registry contract address.                                                                              |
| `INDY_BESU_SCHEMA_REGISTRY_CONTRACT_ADDRESS`   | `0x…5555`                    | Schema registry contract address.                                                                           |
| `INDY_BESU_CRED_DEF_REGISTRY_CONTRACT_ADDRESS` | `0x…4444`                    | Credential definition registry contract address.                                                            |
| `INDY_BESU_SIGNER_PRIVATE_KEY`                 | _(committed dev key)_        | Private key used to sign Indy Besu transactions. **Replace for non-trivial use.**                           |

### Authentication

| Variable             | Default                         | Description                                                                                                                      |
|----------------------|---------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| `OAUTH_STORE_CONFIG` | _(built-in placeholder values)_ | JSON-encoded OAuth client configuration (client ID, redirect URL, scopes, endpoints). Required when `ENABLE_EXTERNAL_AUTH=true`. |

### Feature Flags

| Variable                    | Effect when set to `'true'`                                                                                                                |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `ENABLE_KEPLR_INTEGRATION`  | Enable Keplr / Cosmos chain integration (experimental).                                                                                    |
| `ENABLE_EXTERNAL_AUTH`      | Enable OAuth-based external authentication.                                                                                                |
| `ENABLE_WALLET_BACKUP`      | Enable passkey-based wallet backup. Falls back to disabled on devices that don't support passkeys.                                         |
| `ENABLE_PUBLIC_INVITATION`  | Expose a public DIDComm invitation surface on this wallet.                                                                                 |
| `ENABLE_EXAMPLE_CREDENTIAL` | **Inverted semantics** — set to `'true'` to **disable** the bundled example credential. Default behaviour includes the example credential. |

## Run Checks

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

## Run the App

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

## Create App Bundle

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

#### Bundle for Development

Development bundle can be created and signed using Development Provision profile created by XCode automated signing.

See [Distributing your app to registered devices](http://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)

#### Bundle for App Store/TestFlight Distribution

To sign bundles for App Store/TestFlight distribution, you'll need to import a provisioning key, certificate and profile:
1. Create or get corresponding files from your Apple Developer account/team
   - `.p12` file - private key used for signing
   - `.cer` file - public distribution certificate
   - `.mobileprovision` file - provisioning profile
2. Import key and certificate into you MacOS Keychain (should work out-of-box since `Keychain Access` app is used to open `.p12` and `.cer` files by default)
3. In XCode, find `Signing (Release)` setting in app target, select `Import profile...` option and choose app `.mobileprovision` file
4. Make sure that you're able to create a release app bundle using `Archive` command in XCode
 