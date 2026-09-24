
import { getHolderDid } from '../wallet/did'
import { getOrCreateKeyPair } from '../wallet/key-store'
import { storeCredential, type HeldCredential } from '../wallet/credential-store'


export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants?: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
      'pre-authorized_code': string
      tx_code?: { input_mode: 'numeric' | 'text'; length?: number }
    }
  }
}

interface IssuerMetadata {
  credential_issuer: string
  credential_endpoint: string
  token_endpoint?: string
  authorization_server?: string
  credential_configurations_supported?: Record<string, any>
  credentials_supported?: any[]
}

interface AuthServerMetadata {
  token_endpoint: string
}

interface TokenResponse {
  access_token: string
  token_type: string
  c_nonce?: string
  c_nonce_expires_in?: number
}

interface CredentialResponse {
  credential?: string
  transaction_id?: string
  c_nonce?: string
}

export type ReceiveResult =
  | { ok: true; credential: HeldCredential }
  | { ok: false; error: string; detail?: string }


function base64urlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeJsonBase64url(obj: unknown): string {
  const json = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(json)
  return base64urlEncode(bytes)
}

/**
 * Builds a JWT proof of possession as required by OID4VCI §7.2.1.
 *
 * The JWT is signed with the holder's ECDSA P-256 private key (WebCrypto).
 * The header includes the holder's public JWK so the issuer can verify it.
 */
async function buildJwtProof(
  cNonce: string,
  credentialIssuer: string,
): Promise<string> {
  const keyPair = await getOrCreateKeyPair()
  const holderDid = await getHolderDid()
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)

  const header = {
    alg: 'ES256',
    typ: 'openid4vci-proof+jwt',
    jwk: publicJwk,
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: holderDid,
    aud: credentialIssuer,
    iat: now,
    nonce: cNonce,
  }

  const signingInput = `${encodeJsonBase64url(header)}.${encodeJsonBase64url(payload)}`
  const signingBytes = new TextEncoder().encode(signingInput)

  const signatureBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    signingBytes,
  )

  const signatureBase64url = base64urlEncode(new Uint8Array(signatureBytes))
  return `${signingInput}.${signatureBase64url}`
}

/**
 * Parses an openid-credential-offer:// URI into a CredentialOffer object.
 * Handles both by-value (credential_offer=) and by-reference (credential_offer_uri=).
 */
async function parseOfferUri(offerUri: string): Promise<CredentialOffer> {
  // Strip the scheme and parse as URL for query params
  const withHttps = offerUri.replace(/^openid-credential-offer:\/\//, 'https://offer.local/')
  const url = new URL(withHttps)

  const inlineOffer = url.searchParams.get('credential_offer')
  if (inlineOffer) {
    return JSON.parse(decodeURIComponent(inlineOffer)) as CredentialOffer
  }

  const offerUri2 = url.searchParams.get('credential_offer_uri')
  if (offerUri2) {
    const resp = await fetch(offerUri2)
    if (!resp.ok) {
      throw new Error(`Failed to fetch credential offer from ${offerUri2}: ${resp.status}`)
    }
    return resp.json() as Promise<CredentialOffer>
  }

  throw new Error('Invalid credential offer URI: missing credential_offer or credential_offer_uri')
}


async function fetchIssuerMetadata(credentialIssuer: string): Promise<IssuerMetadata> {
  const url = `${credentialIssuer.replace(/\/$/, '')}/.well-known/openid-credential-issuer`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch issuer metadata from ${url}: ${resp.status}`)
  }
  return resp.json() as Promise<IssuerMetadata>
}

async function fetchTokenEndpoint(
  issuerMetadata: IssuerMetadata,
  credentialIssuer: string,
): Promise<string> {
  // Prefer explicit token_endpoint on the issuer metadata
  if (issuerMetadata.token_endpoint) {
    return issuerMetadata.token_endpoint
  }

  // Fall back to the authorization server's metadata
  const authServer = issuerMetadata.authorization_server ?? credentialIssuer
  const asMetaUrl = `${authServer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
  const resp = await fetch(asMetaUrl)
  if (resp.ok) {
    const asMeta = await resp.json() as AuthServerMetadata
    if (asMeta.token_endpoint) {
      return asMeta.token_endpoint
    }
  }

  // Last resort: assume <issuer>/token
  return `${credentialIssuer.replace(/\/$/, '')}/token`
}


async function exchangePreAuthorizedCode(
  tokenEndpoint: string,
  preAuthorizedCode: string,
  txCode?: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    'pre-authorized_code': preAuthorizedCode,
  })
  if (txCode) {
    body.set('tx_code', txCode)
  }

  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Token request failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<TokenResponse>
}


async function requestCredential(
  credentialEndpoint: string,
  accessToken: string,
  format: string,
  vct: string | undefined,
  cNonce: string,
  credentialIssuer: string,
): Promise<CredentialResponse> {
  const proof = await buildJwtProof(cNonce, credentialIssuer)

  const requestBody: Record<string, any> = {
    format,
    proof: {
      proof_type: 'jwt',
      jwt: proof,
    },
  }

  if (vct) {
    requestBody.vct = vct
  }

  const resp = await fetch(credentialEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Credential request failed (${resp.status}): ${text}`)
  }

  return resp.json() as Promise<CredentialResponse>
}

/**
 * Receives a credential via the OID4VCI Pre-Authorized Code Flow.
 *
 * @param offerUri  The openid-credential-offer:// URI from the issuer
 * @param txCode    Optional transaction code (PIN), if required by the offer
 */
export async function receiveCredential(
  offerUri: string,
  txCode?: string,
): Promise<ReceiveResult> {
  try {
    const offer = await parseOfferUri(offerUri)

    const preAuthGrant =
      offer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    if (!preAuthGrant) {
      return {
        ok: false,
        error: 'Unsupported grant type',
        detail: 'Only the pre-authorized_code grant is supported by this wallet',
      }
    }

    const credentialConfigId = offer.credential_configuration_ids[0]
    if (!credentialConfigId) {
      return {
        ok: false,
        error: 'Invalid offer',
        detail: 'No credential_configuration_ids in the offer',
      }
    }

    const issuerMetadata = await fetchIssuerMetadata(offer.credential_issuer)
    const tokenEndpoint = await fetchTokenEndpoint(issuerMetadata, offer.credential_issuer)

    // Find the requested configuration in metadata
    let format = ''
    let vct: string | undefined
    
    if (issuerMetadata.credential_configurations_supported?.[credentialConfigId]) {
      const config = issuerMetadata.credential_configurations_supported[credentialConfigId]
      format = config.format
      vct = config.vct
    } else if (issuerMetadata.credentials_supported) {
      const config = issuerMetadata.credentials_supported.find((c: any) => c.id === credentialConfigId)
      if (config) {
        format = config.format
        vct = config.vct
      }
    }

    if (!format) {
      return {
        ok: false,
        error: 'Invalid issuer metadata',
        detail: `The issuer metadata does not contain a configuration for ${credentialConfigId}`,
      }
    }

    const tokenResponse = await exchangePreAuthorizedCode(
      tokenEndpoint,
      preAuthGrant['pre-authorized_code'],
      txCode,
    )

    const cNonce = tokenResponse.c_nonce ?? ''
    const credentialResponse = await requestCredential(
      issuerMetadata.credential_endpoint,
      tokenResponse.access_token,
      format,
      vct,
      cNonce,
      offer.credential_issuer,
    )

    if (!credentialResponse.credential) {
      return {
        ok: false,
        error: 'Deferred issuance not supported',
        detail: 'The issuer returned a transaction_id instead of an immediate credential',
      }
    }

    const stored = await storeCredential(credentialResponse.credential)

    return { ok: true, credential: stored }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: 'OID4VCI receive failed', detail: message }
  }
}
