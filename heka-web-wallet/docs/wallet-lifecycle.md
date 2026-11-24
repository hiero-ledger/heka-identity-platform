# Wallet lifecycle

The extension keeps credentials and holder keys in IndexedDB (`heka-wallet-credo` and `heka-wallet-kms`). Closing the browser does not remove them. The next time `wallet.html` starts, it rewrites the popup summary from those records, so the toolbar count matches what is still stored.

Clear site data deletes both databases. The popup summary lives in `chrome.storage.local` and can still list the old credentials until the wallet page starts again. That start finds an empty IndexedDB and sets the summary to zero.

Keys are non-extractable WebCrypto keys. There is no export and no backup file. Recovery is re-issuance: request a new credential offer from the issuer. For Heka's contributor credential, that is the onboarding page, and a GitHub binding that is still GPG-verified stays verified. The new credential gets a new holder key.

