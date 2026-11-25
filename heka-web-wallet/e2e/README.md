# Web Wallet harness (Chrome for Testing)

Two scripts load the built extension in Chrome for Testing. Neither is part of CI.

- **`receive.mjs`**, the bridge on its own page:
  1. the content script loads and answers `PING` with protocol version 1 (a classic script, not a module);
  2. the page hands over a credential offer (`RECEIVE_OFFER`), and the service worker opens `wallet.html`;
  3. the wallet resolves the offer, enters the transaction code, accepts it, and stores the credential;
  4. the page gets `RECEIVE_STATUS` `done` for that offer, and the popup summary shows the issuer's display name and the issue date;
  5. with `HEKA_REQUEST_URI`, the page hands over that presentation request, the wallet presents the credential, and the page gets `PRESENT_STATUS` `done`;
  6. a later, different offer goes to the same wallet window and replaces the first one there, shown as opened from the page's origin.

  It serves its own page (`heka-page.html`) on `http://127.0.0.1:8000`, where the development build injects the bridge without connecting the site, so port 8000 must be free.
- **`web-ui.mjs`**, the Heka web UI and a running identity service:
  1. the contributor's credential step: the offer with its QR code, transaction code and expiry; the wallet button; the wallet's review (the issuer's origin, the self-declared name, the site it was opened from); the transaction code; `RECEIVE_STATUS` `done`; the step completed;
  2. the stored credential: `vct` "GitHub Contributor", `iss` the organization's DID, a `status.status_list` entry, the GitHub claims as disclosures; the offer's state `Completed`;
  3. with `HEKA_VERIFIER_TOKEN`: a DCQL request for that credential from the verifier, the public `/present` page signed out, the wallet button, the wallet's review, `PRESENT_STATUS` `done` on the page, and the verification session `ResponseVerified`.

  It drives the web UI's dev server, which must run on port 8000 (`yarn start` in `heka-identity-service-web-ui`) against the identity service. The contributor's page is reached from the home page and the menu, as after a sign-in: opened directly, the onboarding page doesn't load the contributor's status.

The messages are those of [the bridge protocol](../docs/bridge-protocol.md). `lib.mjs` holds what both scripts share.

## Run

```bash
# In heka-web-wallet: a development build, which accepts http:// issuers such as a local identity service
yarn install
yarn build:dev      # or yarn dev, which rebuilds on every change

# In heka-web-wallet/e2e: its own project, so puppeteer stays out of the extension's dependencies
yarn install        # also downloads Chrome for Testing into ~/.cache/puppeteer
yarn receive        # or: yarn web-ui
```

### `receive.mjs`

The offer comes from one of:

- **A local identity service** (`HEKA_IDENTITY_URL`, default `http://localhost:3000`), started with `CONTRIBUTOR_VERIFICATION_ENABLED=true` and its contributor credential issuer set up (`heka-identity-service/docs/runbooks/issuer-setup.md`). Set `HEKA_TOKEN` to the access token of a user whose GitHub link and GPG verification are done; the harness calls `POST /v2/contributor-credential/offer` for that user.
- **Any OID4VCI offer:** `HEKA_OFFER_URI`, `HEKA_TX_CODE` and, optionally, `HEKA_OFFER_EXPIRES_AT`.

Without either, the harness checks only steps 1, 2 and 6, with offers for issuers that do not exist; the wallet holds each one until its issuer is allowed.

`HEKA_REQUEST_URI` is an `openid4vp:` request the received credential satisfies, for example the `authorizationRequest` of `POST /openid4vc/verification-session/request` with a DCQL query for its `vct`.

### `web-ui.mjs`

| Variable | Default | |
|---|---|---|
| `HEKA_WEB_UI_URL` | `http://localhost:8000` | the web UI's dev server |
| `HEKA_OIDC_AUTHORITY` | required | the web UI's `REACT_APP_OIDC_AUTHORITY`: the harness signs the web UI in by storing the session as its OIDC client does, so no provider is contacted |
| `HEKA_OIDC_CLIENT_ID` | `heka-identity-web-ui` | the web UI's `REACT_APP_OIDC_CLIENT_ID` |
| `HEKA_CONTRIBUTOR_TOKEN` | required | an access token the identity service accepts, of a contributor whose GitHub link and GPG verification are done |
| `HEKA_VERIFIER_TOKEN` | unset | an access token whose role may create verification requests (a Verifier needs an organization); without it, `/present` is skipped |
| `HEKA_ISSUER_DID` | unset | the expected `iss`: the identity service's `CONTRIBUTOR_ISSUER_DID` |

### Both

| Variable | Default | |
|---|---|---|
| `HEKA_WALLET_DIST` | `../dist` | the built extension |
| `PUPPETEER_EXECUTABLE_PATH` | Chrome for Testing from `yarn install` | branded Chrome ignores `--load-extension` |
| `HEKA_E2E_HEADFUL` | unset | any value shows the browser |
| `HEKA_E2E_TIMEOUT_MS` | `60000` | per wait |
| `HEKA_E2E_SCREENSHOTS` | unset | a directory for screenshots of the main steps (`web-ui.mjs`) and of every page after a failure |

An HTTPS issuer or verifier needs host access to its origin, which Chrome asks for with a prompt the harness cannot answer; use a local `http://` identity service with a development build. Connecting a site from the popup has the same limit: the development build's bridge on port 8000 needs no connection.
