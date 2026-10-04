# ADR-0001: GithubContributorCredential Profile

**Status:** Accepted  
**Date:** 2026-06-28  
**Branch:** `feat/github-credential-schema`

---

## Context

As part of the LFDT 2026 mentorship (Issue #87), Heka Identity Platform must issue a
machine-verifiable credential to GitHub contributors who have proven ownership of their
GitHub-linked GPG key pair. This ADR records the design decisions made for the credential
format, DID method, and signing key selection strategy.

---

## Decision 1: Credential Format — SD-JWT VC (not plain JWT or AnonCreds)

### Options Considered

| Format | Pros | Cons |
|--------|------|------|
| Plain JWT VC | Simple, widely supported | No selective disclosure; exposes all claims to every verifier |
| AnonCreds (Hyperledger) | Strong privacy, revocation registry | Not on the OID4VCI/OID4VP standards track; complex setup |
| **SD-JWT VC** ✅ | W3C/IETF standards track; OID4VCI/OID4VP native; selective disclosure | Slightly more tooling overhead than plain JWT |

### Why SD-JWT VC

- **OID4VCI and OID4VP compatibility:** The Credo-ts stack already supports SD-JWT VC
  issuance via OID4VCI and presentation via OID4VP. Using the same format end-to-end
  avoids format conversion at presentation time.
- **Selective disclosure:** Pull-request verification verifiers need to confirm that a
  contributor is verified, but do not necessarily need to see the contributor's raw GPG
  fingerprint or numeric account ID. SD-JWT allows the contributor to disclose only
  what is required by the verifier policy.
- **Standards trajectory:** SD-JWT VC is on the IETF/W3C standards track and is the
  format being adopted by OID4VC-conformant issuers in production. Using it now prepares
  the prototype for real-world interoperability.

---

## Decision 2: SD-JWT Disclosure Policy

The `GithubContributorCredential` uses the following disclosure model:

### Always Revealed (not wrapped in `_sd`)

| Claim | Reason |
|-------|--------|
| `iss` | Issuer DID — verifiers must always know who issued the credential |
| `iat` | Issuance timestamp — required for freshness checks |
| `exp` | Expiry timestamp — required for freshness checks |
| `vct` | Credential type — required so the verifier knows what schema to apply |
| `credentialStatus` | Revocation reference — verifier must be able to check status |

### Selectively Disclosed (wrapped in `_sd`)

| Claim | Reason |
|-------|--------|
| `sub` (contributor DID) | The contributor controls when to reveal their DID |
| `githubUsername` | Not always required; a verifier only needs to confirm _some_ identity was bound |
| `githubAccountId` | Numeric ID is privacy-sensitive; only disclosed when verifier explicitly requires it |
| `gpgFingerprint` | GPG key material is private; only disclosed when required for audit purposes |

### Implication

In the standard PR-verification flow, the verifier policy only requires proof that:
1. The credential was issued by a trusted Heka issuer (`iss`).
2. The credential has not expired (`exp`).
3. The credential type is `GithubContributorCredential` (`vct`).

The contributor can satisfy all three requirements **without revealing `githubUsername`,
`githubAccountId`, or `gpgFingerprint`** to the GitHub App verifier. These claims are
only disclosed when a maintainer-configured policy explicitly requires them.

---

## Decision 3: DID Method — `did:hedera` (not `did:key` or `did:web`)

### Options Considered

| DID Method | Pros | Cons |
|------------|------|------|
| `did:key` | Zero infrastructure; immediate | Ephemeral; not resolvable post-issuance without the original key material; already used and found limited in our MVP |
| `did:web` | Simple; uses HTTPS hosting | Tied to a DNS name; requires web server availability for resolution |
| **`did:hedera`** ✅ | Anchored on a public ledger; independently resolvable; persistent; aligns with Hiero ecosystem | Requires Hedera testnet account and HBAR balance |

### Why `did:hedera`

- **Persistence and public resolution:** A `did:hedera` DID Document is anchored on the
  Hedera network and can be resolved by any party using the Hedera mirror node, without
  requiring Heka to be online. This is a fundamental property for long-lived contributor
  credentials.
- **Ecosystem alignment:** Heka Identity Platform is built within the Hiero/LFDT ecosystem.
  Using the Hedera DID method directly demonstrates the platform's native integration.
- **Proven in spike:** A Hedera testnet connectivity spike was successfully executed
  against operator account `0.0.8383202`, confirming the DID anchoring path works with
  the `@hashgraph/sdk` tooling available in the codebase.
- **Pre-mentorship evidence:** Full DID creation and resolution was validated on Hedera
  testnet with Hashscan evidence captured during the pre-mentorship prototype phase.

---

## Decision 4: Deterministic Verification-Method Selection

### Problem

W3C DID Documents contain a `verificationMethod` array. Naive implementations select
the signing key by array index (e.g., `verificationMethod[0]`). This is fragile because:

- DID Document updates can reorder the array.
- Multiple keys for different purposes (authentication, assertion, key agreement) may
  coexist in the same document.
- Relying on index `0` makes the signing operation non-deterministic across DID Document
  versions.

### Solution

Credo provides a built-in `dereferenceKey` method on `DidDocument` that selects a key by
matching **both the key type and a purpose identifier in the key's `id` fragment**.

```typescript
// Correct ✅ — deterministic, purpose-based selection via Credo
didDocument.dereferenceKey('#assertion-key', ['assertionMethod']);

// Wrong ❌ — breaks when DID Document is updated
didDocument.verificationMethod[0];
```

Using types and API provided by Credo is the preferred option for any Credo-based app
such as Heka Identity Service. This ensures that signing operations are stable regardless
of how the `verificationMethod` array is ordered in any given version of the DID Document.

---

## Consequences

- All credential signing in Heka **must** use Credo's `dereferenceKey` method rather than
  direct array indexing.
- Future DID Document updates that add new verification methods will not break existing
  signing code.
- The disclosure policy table above **must** be updated if new claims are added to
  `GithubContributorCredential` in a future schema version.
- The issuer DID method (`did:hedera`) creates a dependency on Hedera testnet account
  funding. The HBAR balance must be monitored during development.

---

## References

- [JSON Schema for GithubContributorCredential](../../src/credentials/fixtures/github-contributor-credential.schema.json)
- [Mock SD-JWT Payload Fixture](../../src/credentials/fixtures/mock-sd-jwt-payload.json)
- [Heka Hedera Documentation](./hedera.md)
- [SD-JWT VC Issuance Guide](./how-to-issue-sd-jwt-vc.md)
- [IETF SD-JWT Specification](https://www.ietf.org/archive/id/draft-ietf-oauth-selective-disclosure-jwt-13.html)
- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
