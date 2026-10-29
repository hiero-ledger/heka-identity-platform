# Heka Wallet — Device E2E Tests (Maestro)

## Description

- Black-box UI tests that drive the installed Heka Wallet app (`com.heka.wallet`) on an Android device or emulator
- Written for [Maestro](https://docs.maestro.dev); the flows live in [`.maestro/`](../.maestro)
- Run and debug them locally with [Maestro Studio](#ui-testing-with-maestro-studio); CI runs them on an Android emulator ([CI/CD](#cicd))
- Android only: the flows use Android ids (the app chooser, Chrome's password sheet)
- Out of reach for Maestro: biometrics, camera QR scanning, passkeys. Credential offers are opened through the deep-link scheme instead of the camera

> **Warning:** every flow starts with `clearState` and `clearKeychain`. Running a flow wipes the wallet on the device.

| Path | What it is |
|---|---|
| `.maestro/config.yaml` | Workspace config: runs every top-level `*.yaml`, continues after a failed flow |
| `.maestro/*.yaml` | The test flows (one test each) |
| `.maestro/subflows/` | Reusable steps called with `runFlow`; not run on their own |
| `.maestro/scripts/` | JavaScript run by Maestro (`runScript`) to call the backend |

## Flows

Tags group the flows:

| Tag | Meaning |
|---|---|
| `no-backend` | Needs only the app and Metro |
| `backend` | Needs Keycloak and identity-service |
| `external-auth` | Needs a build with `ENABLE_EXTERNAL_AUTH=true` |
| `onboarding`, `pin` | Topic tags; not used to select a suite |

### `onboarding.yaml` — Onboarding with a new PIN opens Home

Tags: `onboarding`, `no-backend`.

1. Runs `subflows/onboard.yaml`: fresh install to Home (see [Subflows](#subflows))
2. Checks that the Scan and Settings tabs are visible

Proves: a new user can finish onboarding and set a PIN.

### `unlock-with-pin.yaml` — Restarted wallet unlocks with its PIN

Tags: `pin`, `no-backend`.

1. Runs `subflows/onboard.yaml`
2. Stops and starts the app (state is kept)
3. Waits for the PIN keypad
4. Enters the same PIN
5. Waits for Home (Credentials tab)

Proves: the PIN set at onboarding unlocks the wallet after a restart.

### `login.yaml` — Keycloak login opens the onboarding tutorial

Tags: `external-auth`. Needs a build with `ENABLE_EXTERNAL_AUTH=true` and Keycloak.

1. Starts the app with clean state
2. Waits for the Login screen
3. Runs `subflows/login.yaml`: logs in through Keycloak in a Chrome Custom Tab
4. Waits for the first onboarding tutorial page

Proves: the OAuth login round trip works and returns to the app.

### `credential-offer.yaml` — SD-JWT credential offer from identity-service is accepted

Tags: `backend`. Needs identity-service, Postgres and Keycloak.

1. Runs `subflows/onboard.yaml`
2. Runs `scripts/create-sd-jwt-offer.js`, which calls identity-service:
   - gets a token for the `heka-e2e` client (or uses `ISSUER_TOKEN`)
   - reuses the tenant's did:key, or creates one on the first run (a tenant holds one public DID)
   - reuses the OID4VC issuer for that DID, or creates it; adds the `MaestroE2ESdJwt` credential type when missing
   - creates a new SD-JWT VC offer (`vct` `https://example.com/maestro-e2e`, claims `first_name`, `last_name`)
   - returns the deep link `openid-credential-offer://?credential_offer_uri=...`
3. Opens the deep link. Runs `subflows/choose-heka-wallet.yaml` if Android asks which app should open it
4. Waits for the Credential Offer screen, scrolls to Accept and taps it
5. Taps Done on the confirmation
6. Checks that Home shows the new credential card

Proves: the wallet receives, accepts and stores an OID4VCI SD-JWT credential from identity-service.

With the `heka-e2e` client the test data lands in the `Organization_heka-e2e` tenant, never in `Administration` or `Organization_heka-sso`.

### Subflows

| Subflow | What it does | Input |
|---|---|---|
| `subflows/onboard.yaml` | Fresh install → [Keycloak login] → tutorial pages → Terms (scroll, Accept) → create PIN twice → skip biometrics → Home → [account check]. The login and the account check run only when the build shows the Login screen | `PIN`; `KC_USERNAME`, `KC_PASSWORD`, `KC_EMAIL` with external auth |
| `subflows/login.yaml` | Taps Login and fills the Keycloak form in the Chrome Custom Tab. Chrome keeps its Keycloak session across `clearState`, so the form is filled only when it appears | `KC_USERNAME`, `KC_PASSWORD` |
| `subflows/assert-account.yaml` | Settings → User profile must show `KC_EMAIL`, then back to Home. Catches a reused Chrome session of another user | `KC_EMAIL` |
| `subflows/enter-pin.yaml` | Taps the 6 PIN digits on the keypad | `PIN` |
| `subflows/dismiss-chrome-password-sheet.yaml` | Closes Chrome's "use saved password?" sheet if it covers the form | — |
| `subflows/choose-heka-wallet.yaml` | Picks Heka Wallet "just once" when another app on the device also handles the deep-link scheme | — |

## UI Testing with Maestro Studio

[Maestro Studio](https://docs.maestro.dev/maestro-studio) is a desktop app for running and writing flows. It shows the device screen next to the flow, highlights each step as it runs, records every run, and lets you right-click an element on the screen to add a command for it.

### 1. Install Maestro Studio

Download the installer from the [Maestro quickstart](https://docs.maestro.dev/get-started/quickstart):

| OS | Installer | Install |
|---|---|---|
| Windows | [MaestroStudio.exe](https://studio.maestro.dev/MaestroStudio.exe) | Run the `.exe` and follow the wizard |
| macOS | [MaestroStudio.dmg](https://studio.maestro.dev/MaestroStudio.dmg) | Open the `.dmg` and drag Maestro Studio to `Applications` |
| Linux | [MaestroStudio.AppImage](https://studio.maestro.dev/MaestroStudio.AppImage) | `chmod +x MaestroStudio.AppImage && ./MaestroStudio.AppImage --no-sandbox` |

Running the flows locally needs no Maestro Cloud account.

### 2. Prepare the device and the app

1. **Start an Android emulator or connect a device.** Check it is listed by `adb devices`. Keep only one device connected.

2. **Pick the build variant.** The `ENABLE_EXTERNAL_AUTH` flag in the app env file decides which flows can run:

   | Build | What onboarding does | Flows that can run |
   |---|---|---|
   | `ENABLE_EXTERNAL_AUTH=false` | Starts at the tutorial; no login | `onboarding`, `unlock-with-pin`, `credential-offer` |
   | `ENABLE_EXTERNAL_AUTH=true` | Logs in through Keycloak first, then checks the account | all flows |

   For the `false` variant, make a copy of the env file with the flag off (`.env.e2e` is git-ignored):

   ```shell
   cd heka-wallet/app
   sed 's/^ENABLE_EXTERNAL_AUTH=.*/ENABLE_EXTERNAL_AUTH=false/' .env.example > .env.e2e
   ```

3. **Build and install a debug APK.** Use a debug build that loads its JavaScript from Metro. A dev bundle inside the APK shows a LogBox devtools error; a production bundle fails agent initialisation on the Splash screen. Rebuild after any change to the env file.

   macOS / Linux:

   ```shell
   cd heka-wallet/app/android
   ENVFILE=.env.e2e ./gradlew assembleDebug    # ENVFILE=.env for the external-auth variant
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

   Windows (`cmd`):

   ```bat
   cd heka-wallet\app\android
   set ENVFILE=.env.e2e&& gradlew.bat assembleDebug
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```

4. **Forward the ports.** The app reaches Metro and the backend on `localhost`. Run again after the device reconnects or the emulator restarts.

   ```shell
   adb reverse tcp:8081 tcp:8081   # Metro
   adb reverse tcp:8080 tcp:8080   # Keycloak (external-auth and backend flows)
   adb reverse tcp:3000 tcp:3000   # identity-service API
   adb reverse tcp:3003 tcp:3003   # identity-service OID4VC router (credential offer)
   ```

5. **Start Metro and warm the bundle.** The first bundle build takes minutes, but the flows wait only 120 s for the first screen. Fetch the bundle once before the first run. Use exactly this URL: Metro caches the bundle per query, and this is the query the debug app sends.

   ```shell
   cd heka-wallet/app
   yarn start
   # in another terminal:
   curl -sf -o /dev/null "http://localhost:8081/index.bundle?platform=android&dev=true&lazy=true&minify=false&app=com.heka.wallet&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server"
   ```

6. **Turn off Chrome's first-run screens** (external-auth builds). The Keycloak login opens in a Chrome Custom Tab; on a fresh emulator Chrome's welcome screens cover it. Open Chrome once by hand and finish them, or run:

   ```shell
   adb shell am set-debug-app --persistent com.android.chrome
   adb shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
   ```

7. **Start the backend** (only for the `backend` and `external-auth` flows): Keycloak on `8080`, identity-service on `3000` and `3003`, Postgres. The simplest way is the root Compose stack, as in CI. From the repository root:

   ```shell
   cp .env.example .env
   docker compose --profile keycloak up -d --build postgres keycloak heka-identity-service
   ```

### 3. Open the workspace

1. Launch Maestro Studio.
2. Click **New workspace** and select the `heka-wallet/.maestro` folder.
3. Click **Select device** at the top left and pick your emulator or device.

### 4. Set up the environment variables

Studio keeps variables in **environments**. Create one per build variant:

1. Click the **Env** icon, then **Manage Environments**, then **Create**.
2. Add the variables as key-value pairs (table below).
3. Optionally set **Included** / **Excluded** tags, e.g. exclude `external-auth` for the `ENABLE_EXTERNAL_AUTH=false` build.
4. Select the environment before you run a flow.

| Environment | Variables |
|---|---|
| `local-no-auth` (build `ENABLE_EXTERNAL_AUTH=false`) | `IDENTITY_SERVICE_URL`, `TOKEN_URL`, `E2E_CLIENT_ID`, `E2E_CLIENT_SECRET` — only for `credential-offer` |
| `local-auth` (build `ENABLE_EXTERNAL_AUTH=true`) | `KC_USERNAME`, `KC_PASSWORD`, `KC_EMAIL`, `IDENTITY_SERVICE_URL`, `TOKEN_URL`, `E2E_CLIENT_ID`, `E2E_CLIENT_SECRET` |

| Variable | Used by | Local value |
|---|---|---|
| `PIN` | `onboarding`, `unlock-with-pin`, `credential-offer` | Set in each flow (`482916`); add it to the environment only to override |
| `KC_USERNAME`, `KC_PASSWORD` | `subflows/login.yaml` | A user of the `heka-wallet` realm, e.g. `wallet-demo` |
| `KC_EMAIL` | `subflows/assert-account.yaml` | The email of `KC_USERNAME`, e.g. `wallet-demo@example.com` |
| `IDENTITY_SERVICE_URL` | `scripts/create-sd-jwt-offer.js` | `http://localhost:3000` |
| `TOKEN_URL` | `scripts/create-sd-jwt-offer.js` | `http://localhost:8080/realms/heka-platform/protocol/openid-connect/token` |
| `E2E_CLIENT_ID`, `E2E_CLIENT_SECRET` | `scripts/create-sd-jwt-offer.js` | Client `heka-e2e`. Its token needs an issuer-capable role: `Admin`, `OrgAdmin`, `OrgManager` or `Issuer` |
| `ISSUER_TOKEN` | `scripts/create-sd-jwt-offer.js` | Optional: a ready access token; replaces `TOKEN_URL`, `E2E_CLIENT_ID` and `E2E_CLIENT_SECRET` |

The local dev password and client secret are in [`heka-sso-service/keycloak/README.md`](../../heka-sso-service/keycloak/README.md). They are dev-only: use them only against a local Keycloak, and never put real credentials in a Studio environment.

### 5. Run a flow

1. Open a top-level flow, e.g. `onboarding.yaml`. Do not run files in `subflows/` on their own: they expect a state and inputs set by the calling flow.
2. Click **Run Locally**.
3. Watch the device. Studio highlights each step as it passes, or shows why it failed (usually an element it could not find).
4. After a failure, open the run recording and step to the failing command to see the screen at that moment.

Start with `onboarding.yaml`: it needs no backend and checks that the device, the build and Metro are set up.

### 6. Write or fix a flow

- Right-click an element on the device screen to add a command for it, or type `-` in the editor for the list of commands. Autocomplete suggests selectors from the current screen.
- Prefer `testID` selectors. Bifold's `testIdWithKey(key)` becomes the Android resource id `com.ariesbifold:id/<key>`, e.g. `id: 'com.ariesbifold:id/TabCredentials'`. Renaming a `testID` in the app breaks the flows.
- Buttons at the end of a scroll view (Terms `Accept`, `AcceptCredentialOffer`) need `scrollUntilVisible` before the tap.
- Wait with `extendedWaitUntil` and a timeout, never a fixed sleep. A debug build on a CI emulator needs over 30 s to start its JS and about 40 s to initialise the agent.
- Text selectors are full-match regular expressions: quote dots and other special characters.
- Give a new flow `appId`, `name` and a tag. CI runs a flow only if it has the `no-backend`, `backend` or `external-auth` tag.
- Studio may save run recordings in the workspace folder. Do not commit them.

### Run from the command line

The same flows run without Studio through the [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) (CI uses version `2.11.0`). From `heka-wallet/`, `yarn test:e2e` is `maestro test .maestro`; extra arguments go to Maestro:

```shell
yarn test:e2e --include-tags no-backend
yarn test:e2e --exclude-tags external-auth -e IDENTITY_SERVICE_URL=http://localhost:3000 -e TOKEN_URL=... -e E2E_CLIENT_ID=heka-e2e -e E2E_CLIENT_SECRET=...
maestro test .maestro/onboarding.yaml
```

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The first screen does not appear within 120 s | Metro is not running, `adb reverse tcp:8081` is missing, or the bundle is cold. Repeat steps 4 and 5 of [Prepare the device and the app](#2-prepare-the-device-and-the-app) |
| Red LogBox about devtools websocket, or agent init fails on Splash | The APK has a bundle inside. Use a debug build with Metro |
| Login screen is shown in a build that should skip it (or the reverse) | The APK was built with another env file. Rebuild with the right `ENVFILE` |
| The account check fails with another user's email | Chrome reused another user's Keycloak session. Log out in Chrome or clear Chrome's data |
| OAuth login fails on a physical device | The device has no secure lock screen. Set a PIN or pattern on the device |
| Chrome welcome screens cover the login | Turn off Chrome's first-run screens (step 6) |
| `create-sd-jwt-offer.js` fails with `Missing env ...` or `Token request failed` | The selected environment lacks a variable, or the client id or secret is wrong, or Keycloak is down |
| The credential offer screen never appears | The wallet cannot reach the offer URL. Check `adb reverse tcp:3003` and identity-service's `AGENT_OID4VCI_ENDPOINT` |

The app log (debug builds): `adb shell run-as com.heka.wallet cat files/log.txt`.

## CI/CD

Workflow: [`.github/workflows/heka-wallet-e2e.yml`](../../.github/workflows/heka-wallet-e2e.yml) — "Heka Wallet device e2e (Maestro)".

**When it runs:** on pull requests to `main` that change `heka-wallet/**` or what the backend suite builds or mounts (`heka-identity-service/**`, the Keycloak realms and theme, `docker/keycloak/**`, `docker/postgres/**`, root `docker-compose.yml`, root `.env.example`), and by hand (`workflow_dispatch`). It uses a GitHub-hosted Android emulator; no Maestro Cloud, no account.

**Suites:** a matrix runs two jobs in parallel:

| Suite | Flows | Build | Backend |
|---|---|---|---|
| `no-backend` | tag `no-backend`: `onboarding`, `unlock-with-pin` | `ENABLE_EXTERNAL_AUTH=false` | none |
| `backend` | tags `backend`, `external-auth`: `credential-offer`, `login`; onboarding logs in as `wallet-demo` | `ENABLE_EXTERNAL_AUTH=true` | root Compose stack: `postgres`, `keycloak` (profile `keycloak`), `heka-identity-service` |

The `backend` suite passes the dev-only Keycloak user and the `heka-e2e` client as `-e` variables in the matrix.

**Steps of each job:**

1. Checks out the code, sets up Java 17 and Node 22, runs `yarn install --immutable`.
2. `backend` only: starts the Compose stack in the background while the APK builds.
3. Writes `app/.env.ci` from `.env.example` with the suite's `ENABLE_EXTERNAL_AUTH`.
4. Builds a debug APK for `x86_64` with `ENVFILE=.env.ci`.
5. Starts Metro and warms the bundle: [`scripts/e2e-start-metro.sh`](../scripts/e2e-start-metro.sh).
6. `backend` only: waits for Keycloak and identity-service: [`scripts/e2e-wait-backend.sh`](../scripts/e2e-wait-backend.sh). It fails at once if `docker compose up` failed.
7. Installs the Maestro CLI from the pinned release zip (`MAESTRO_VERSION`), checked against `MAESTRO_SHA256`.
8. Boots an API 34 `google_apis` emulator (AVD cached) and runs [`scripts/e2e-ci.sh`](../scripts/e2e-ci.sh) with the suite's Maestro arguments. The script runs `adb reverse` for ports 8081, 8080, 3000 and 3003, installs the APK, turns off Chrome's first-run screens, streams logcat and runs `maestro test .maestro`.
9. `backend` only: collects the Compose logs.
10. Uploads the `maestro-results-<suite>` artifact.

**Results:** download the `maestro-results-no-backend` or `maestro-results-backend` artifact from the workflow run. It holds:

| File | Content |
|---|---|
| `e2e-output/report.xml` | JUnit report |
| `e2e-output/debug/` | Maestro debug output per flow (commands, screenshots) |
| `e2e-output/test-output/` | Maestro test output |
| `e2e-output/logcat.txt` | Device logcat for the whole run |
| `e2e-output/app-log.txt` | The app's `files/log.txt` |
| `e2e-output/backend.log`, `compose-ps.txt` | Compose logs (`backend` suite) |
| `metro.log` | Metro output |

**Updating Maestro:** change `MAESTRO_VERSION` and `MAESTRO_SHA256` together. The SHA-256 of `maestro.zip` is in the release's `checksums_sha256.txt`.
