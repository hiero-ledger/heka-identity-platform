# Web Wallet harness (Chrome for Testing)

`receive.mjs` loads the built extension in Chrome for Testing and checks the path a Heka page uses:

1. the content script loads on a trusted Heka origin and answers `PING` (a classic script, not a module);
2. the page hands over a credential offer (`RECEIVE_OFFER`), and the service worker opens `wallet.html`;
3. the wallet resolves the offer, enters the transaction code, accepts it, and stores the credential;
4. the Heka page gets `RECEIVE_STATUS` `done`, and the popup summary shows the issuer's display name and the issue date;
5. a later offer goes to the same wallet window.

It serves its own Heka page (`heka-page.html`) on `http://127.0.0.1:8000`, one of the origins in `manifest.json`, so port 8000 must be free. It is not part of CI.

## Run

```bash
# In heka-web-wallet: a development build, which accepts http:// issuers such as a local identity service
yarn install
yarn dev            # or a one-off build: node_modules/.bin/vite build --mode development

# In heka-web-wallet/e2e: its own project, so puppeteer stays out of the extension's dependencies
yarn install        # also downloads Chrome for Testing into ~/.cache/puppeteer
yarn receive
```

The offer comes from one of:

- **A local identity service** (`HEKA_IDENTITY_URL`, default `http://localhost:3000`), started with `CONTRIBUTOR_VERIFICATION_ENABLED=true`. Set `HEKA_TOKEN` to the access token of a user whose GitHub link and GPG verification are done; the harness calls `POST /v2/contributor-credential/offer` for that user.
- **Any OID4VCI offer:** `HEKA_OFFER_URI`, `HEKA_TX_CODE` and, optionally, `HEKA_OFFER_EXPIRES_AT`.

Without either, the harness checks only steps 1, 2 and 5, with an offer for an issuer that does not exist.

Other settings:

| Variable | Default | |
|---|---|---|
| `HEKA_WALLET_DIST` | `../dist` | the built extension |
| `PUPPETEER_EXECUTABLE_PATH` | Chrome for Testing from `yarn install` | branded Chrome ignores `--load-extension` |
| `HEKA_E2E_HEADFUL` | unset | any value shows the browser |
| `HEKA_E2E_TIMEOUT_MS` | `60000` | per wait |

An HTTPS issuer needs the optional host permission, which Chrome asks for with a prompt the harness cannot answer; use a local `http://` issuer with a development build.
