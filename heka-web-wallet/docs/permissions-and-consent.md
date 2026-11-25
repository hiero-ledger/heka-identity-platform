# Permissions and consent

The wallet accepts credentials from any issuer and presents to any verifier the holder approves. It keeps no trust list and does not evaluate issuers or verifiers. Instead it limits which web pages can talk to it and which servers it contacts, asks the holder before it receives or presents anything, and shows on each consent screen what it could verify and what the other party only claims.

## Connected sites

A web page reaches the wallet through the bridge content script ([bridge-protocol.md](bridge-protocol.md)). The bridge runs only on the sites the holder connected:

1. On the site's tab, open the wallet's popup and press **Connect this site**. Chrome asks for access to that origin (`https://site.example/*`).
2. The wallet registers the bridge for the site's pages (`chrome.scripting.registerContentScripts`, kept across browser restarts), stores the origin in `chrome.storage.local` (`connectedSites`), and injects the bridge into the page already open, which then receives `EXTENSION_READY`.

If the bridge cannot be registered or the site cannot be stored, the wallet gives the access back and the site stays unconnected.

**Disconnect** in the popup forgets the site, unregisters the bridge and gives up the access to the origin. A page that is already open keeps its bridge until it reloads, but the service worker ignores it.

Only https origins can be connected, and http on `localhost` or `127.0.0.1`. The popup reads the active tab's URL through `activeTab`, so the wallet sees no other tab.

The service worker takes the bridge commands (`GET_STATUS`, `RECEIVE_OFFER`, `PRESENT_REQUEST`) only from a connected origin, and nothing else from a web page. The wallet's own pages (popup, wallet page) are recognised by their extension URL. A site whose access the holder removes in Chrome (`chrome://extensions`, Site access) is disconnected at once (`chrome.permissions.onRemoved`): the wallet forgets it and unregisters its bridge. When the extension is installed or updated and when the browser starts, the registrations are also matched to the stored list.

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

Chrome shows its own prompt only for origins not granted yet. A refused grant, or a request Chrome fails, keeps the offer or request saved; the wallet names the origin, and the same button asks again. Granted origins stay granted until removed in `chrome://extensions`, or until a connected site with the same origin is disconnected.

The wallet asks only for one host at a time. A URL whose host holds a `*` (also percent-encoded, as in `exa%2Ample.com`) or anything but letters, digits, hyphens and dots, an IPv6 literal, or a plain-http host other than `localhost` and `127.0.0.1` is never asked for. An internationalized name is asked for in its punycode form. Such a URL can then not be contacted.

Reading an offer can also contact servers the URI does not name, such as the issuer's metadata when the offer is hosted elsewhere. Those requests go out without host access, so they work only if that server allows cross-origin requests.

## What consent shows

A connected site hands an offer or a request over; it doesn't vouch for it. Any connected page can send any offer or request (the Heka web UI's public `/present` page passes on a verifier's request as it is), so the wallet shows the page as **Opened from**: where the item came from, not who stands behind it.

**Credential offer:**

- **Issuer:** the origin of `credential_issuer`, with the full URL when it has a path. This is the server the wallet contacts.
- **Name:** the issuer's display name, marked "(self-declared, not verified)": the issuer's metadata says so, nothing checks it.
- **Opened from:** the connected site that handed the offer over, or "Pasted into the wallet" for the popup's Receive tab.
- The expiry, the credentials with their display data (also self-declared), and the transaction code field.
- After receipt, **Signed by:** the `iss` of the stored credentials.

The issuer origin is what the holder judges an offer by, not the page it was opened from.

**Presentation request:**

- **Verifier:** the client id Credo resolved for the request's client id prefix, followed by the prefix. With `decentralized_identifier`, `x509_san_dns` or `x509_hash`, Credo checked the request's signature against that DID or certificate. A `redirect_uri` request is unsigned: its client id is only where the response goes, so the wallet marks it "not verified".
- **Sends to:** the origin of `response_uri`.
- **Name:** `client_metadata.client_name`, "(self-declared, not verified)".
- **Origin:** only for a request that carries the web origin it came from (the Digital Credentials API); a request opened from a URI has none.
- **Opened from**, as for offers, and the claims each credential will disclose.

The verifier's id with its prefix, the **Sends to** origin and the self-declared name are what the holder judges a request by, not the page it was opened from.

The popup's credential list marks the issuer name the same way and shows the signing `iss`.

## Type metadata

When it receives an SD-JWT VC, Credo resolves the `vct`'s type metadata. The wallet's `customTypeMetadataResolver` (`src/credo/type-metadata-policy.ts`) fetches it only when all of these hold:

- the `vct` is an https URL on a host the wallet could ask access for (the rule of [the previous section](#host-access-one-origin-at-a-time));
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

`manifest.json` is the production manifest; the build's copy plugin (`vite.config.ts`) writes the development one. `yarn build` ends with `check:manifest`, which fails when the built manifest grants any host access at install, allows optional host access other than exactly `https://*/*`, `http://localhost/*` and `http://127.0.0.1/*`, declares a content script, or keeps a permission the bundle does not use. `activeTab` unlocks no API of its own, so an explicit rule keeps it only while the popup reads the active tab. CI runs the production build.
