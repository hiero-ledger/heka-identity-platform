# Trust and permissions

The wallet accepts credentials from any issuer and presents to any verifier the holder approves. It keeps no trust list. Instead it limits which web pages can talk to it and which servers it contacts, and shows on each consent screen what it could verify and what the other party only claims.

## Connected sites

A web page reaches the wallet through the bridge content script ([bridge-protocol.md](bridge-protocol.md)). The bridge runs only on the sites the holder connected:

1. On the site's tab, open the wallet's popup and press **Connect this site**. Chrome asks for access to that origin (`https://site.example/*`).
2. The wallet registers the bridge for the site's pages (`chrome.scripting.registerContentScripts`, kept across browser restarts), stores the origin in `chrome.storage.local` (`connectedSites`), and injects the bridge into the page already open, which then receives `EXTENSION_READY`.

**Disconnect** in the popup forgets the site, unregisters the bridge and gives up the access to the origin. A page that is already open keeps its bridge until it reloads, but the service worker ignores it.

Only https origins can be connected, and http on `localhost` or `127.0.0.1`. The popup reads the active tab's URL through `activeTab`, so the wallet sees no other tab.

The service worker takes the bridge commands (`GET_STATUS`, `RECEIVE_OFFER`, `PRESENT_REQUEST`) only from a connected origin, and nothing else from a web page. The wallet's own pages (popup, wallet page) are recognised by their extension URL. When the extension is installed or updated and when the browser starts, the registrations are matched to the stored list; a site whose access was removed in Chrome (`chrome://extensions`, Site access) is disconnected then.

A connected site can:

- learn that the wallet is installed, whether it has started, and how many credentials it holds (`GET_STATUS`);
- hand over a credential offer or a presentation request, which opens the wallet window for the holder to review;
- receive the final status of the items it handed over, and only those (statuses go to the tab that sent the item).

It cannot accept an offer or present a credential: only the holder can, in the wallet window.

## Host access, one origin at a time

The extension has no host access at install (in the production build). It asks for an origin from the click that needs it:

| Click | Origins |
|---|---|
| **Review offer** / **Review request** (when access is missing) | The offer's `credential_offer_uri`, the `credential_issuer` of an offer passed by value, or the request's `request_uri` |
| **Accept credential** | The issuer (`credential_issuer`, `credential_endpoint`, `nonce_endpoint`) and its authorization servers (`issuer`, `token_endpoint`) |
| **Present credential** | The verifier's `response_uri` |

Chrome shows its own prompt only for origins not granted yet. A refused grant keeps the offer or request saved, and the wallet names the origin it was not allowed to contact. Granted origins stay granted until removed in `chrome://extensions`, or until a connected site with the same origin is disconnected.

Reading an offer can also contact servers the URI does not name, such as the issuer's metadata when the offer is hosted elsewhere. Those requests go out without host access, so they work only if that server allows cross-origin requests.

## What consent shows

**Credential offer:**

- **Issuer:** the origin of `credential_issuer`, with the full URL when it has a path. This is the server the wallet contacts.
- **Name:** the issuer's display name, marked "(self-declared, not verified)": the issuer's metadata says so, nothing checks it.
- **Requested by:** the connected site that handed the offer over, or "Pasted into the wallet" for the popup's Receive tab.
- The expiry, the credentials with their display data (also self-declared), and the transaction code field.
- After receipt, **Signed by:** the `iss` of the stored credentials.

**Presentation request:**

- **Verifier:** the client id Credo verified for the request's client id prefix, followed by the prefix (`decentralized_identifier`, `redirect_uri`, `x509_san_dns`, …), which says how it was verified.
- **Sends to:** the origin of `response_uri`.
- **Name:** `client_metadata.client_name`, "(self-declared, not verified)".
- **Requested by**, as for offers, and the claims each credential will disclose.

The popup's credential list marks the issuer name the same way and shows the signing `iss`.

## Type metadata

When it receives an SD-JWT VC, Credo resolves the `vct`'s type metadata. The wallet's `customTypeMetadataResolver` (`src/credo/type-metadata-policy.ts`) fetches it only when all of these hold:

- the `vct` is an https URL;
- the credential pins the document with `vct#integrity` (Credo checks the hash);
- the wallet already has host access to the `vct`'s origin.

Otherwise it fetches nothing. A credential is still received, without type metadata. A type that extends another one (`extends`) is refused with "Type metadata of `<vct>` is not fetched: `<reason>`", because Credo needs the extended document.

## Builds

| | `yarn build` (production) | `yarn build:dev`, `yarn dev` (development) |
|---|---|---|
| Permissions | `storage`, `scripting`, `activeTab` | the same |
| Host access at install | none | `http://localhost/*`, `http://127.0.0.1/*` |
| Optional host access | `https://*/*`, `http://localhost/*`, `http://127.0.0.1/*` | `https://*/*` |
| Bridge without connecting | none | `http://localhost:8000`, `http://127.0.0.1:8000` (the web UI's dev server and the e2e harness) |
| `http://` issuers and verifiers | refused by Credo | allowed |
| Source maps | no | yes |

`manifest.json` is the production manifest; the build's copy plugin (`vite.config.ts`) writes the development one. `yarn build` ends with `check:manifest`, which fails when the built manifest grants http access at install, declares a content script, or keeps a permission the bundle does not use. CI runs the production build.
