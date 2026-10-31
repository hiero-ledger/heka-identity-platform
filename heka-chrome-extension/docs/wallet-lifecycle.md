# Wallet lifecycle

The extension keeps credentials and holder keys in IndexedDB (`heka-wallet-credo` and `heka-wallet-kms`). Closing the browser does not remove them. The next time `wallet.html` starts, it rewrites the popup summary from those records, so the toolbar count matches what is still stored.

Clear site data deletes both databases. The popup summary lives in `chrome.storage.local` and can still list the old credentials until the wallet page starts again. That start finds an empty IndexedDB and sets the summary to zero.

Keys are non-extractable WebCrypto keys. There is no export and no backup file. Recovery is re-issuance: from the Heka onboarding page, request a new credential offer. If the GitHub binding is still GPG-verified, that verification is kept. The new credential gets a new holder key.

## Third-party wallets

Sphereon and other third-party wallets are out of scope. The Heka extension is the only holder this prototype verifies against.

## Linked VP

Linked VP stays deferred. The wallet page stays open when the toolbar popup closes, and Week 9 found no lifecycle blocker that would make per-pull-request signing impractical. This document does not design a Linked VP.
