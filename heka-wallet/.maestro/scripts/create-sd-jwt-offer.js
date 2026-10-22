// Creates an SD-JWT VC offer in identity-service and sets output.offerDeepLink. The tenant wallet holds one
// public DID, so the did:key and its issuer are created on the first run and reused after; the offer is new per run.
// Env: IDENTITY_SERVICE_URL, and either ISSUER_TOKEN or TOKEN_URL + E2E_CLIENT_ID + E2E_CLIENT_SECRET
// (a client-credentials client whose token has an issuer-capable role: Admin, OrgAdmin, OrgManager or Issuer).
// Maestro's GraalJS runtime provides http, json, output and the flow's env variables as globals.
/* global http, json, output, IDENTITY_SERVICE_URL, ISSUER_TOKEN, TOKEN_URL, E2E_CLIENT_ID, E2E_CLIENT_SECRET */

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing env ${name}`)
  return value
}

function getToken() {
  if (typeof ISSUER_TOKEN !== 'undefined' && ISSUER_TOKEN) return ISSUER_TOKEN
  const response = http.post(requireEnv('TOKEN_URL', TOKEN_URL), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=client_credentials' +
      `&client_id=${encodeURIComponent(requireEnv('E2E_CLIENT_ID', E2E_CLIENT_ID))}` +
      `&client_secret=${encodeURIComponent(requireEnv('E2E_CLIENT_SECRET', E2E_CLIENT_SECRET))}`,
  })
  if (!response.ok) throw new Error(`Token request failed: ${response.status}`)
  return json(response.body).access_token
}

function getJson(path, token) {
  const response = http.get(`${requireEnv('IDENTITY_SERVICE_URL', IDENTITY_SERVICE_URL)}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status} ${response.body}`)
  return json(response.body)
}

function postJson(path, token, body) {
  const response = http.post(`${requireEnv('IDENTITY_SERVICE_URL', IDENTITY_SERVICE_URL)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status} ${response.body}`)
  return json(response.body)
}

const token = getToken()
const credentialId = 'MaestroE2ESdJwt'

const ownDids = getJson('/dids?own=true', token)
const did = ownDids.length ? ownDids[0].id : postJson('/dids', token, { method: 'key' }).id

const issuers = getJson(`/openid4vc/issuer?publicIssuerId=${encodeURIComponent(did)}`, token)
const hasCredential = issuers.some((issuer) => issuer.credentialsSupported.some((c) => c.id === credentialId))
if (!hasCredential) {
  postJson('/openid4vc/issuer', token, {
    publicIssuerId: did,
    credentialsSupported: [
      {
        id: credentialId,
        format: 'vc+sd-jwt',
        vct: 'https://example.com/maestro-e2e',
        proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] } },
      },
    ],
  })
}

const offer = postJson('/openid4vc/issuance-session/offer', token, {
  publicIssuerId: did,
  credentials: [
    {
      credentialSupportedId: credentialId,
      format: 'vc+sd-jwt',
      issuer: { method: 'did', did },
      payload: { first_name: 'Maestro', last_name: 'E2E' },
    },
  ],
})

output.offerDeepLink = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
  offer.issuanceSession.credentialOfferUri
)}`
