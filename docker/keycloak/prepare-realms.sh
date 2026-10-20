#!/bin/sh
# Copies the realm files of heka-sso-service/keycloak into the volume Keycloak imports from
# (service keycloak-realms of the root Compose `keycloak` profile). It also sets the issuer of
# the `heka` realm's heka-sso identity provider to SSO_ISSUER_URL, so the broker accepts the
# SSO service's tokens on localhost or behind an https tunnel. Keycloak imports a realm only
# when it does not exist yet, so recreate the Keycloak container to apply changes.
set -eu

src=/realms-src
dst=/realms
issuer="${SSO_ISSUER_URL:?SSO_ISSUER_URL must be set (root .env: SSO_SERVICE_OIDC_ISSUER_URL in the Keycloak or Auth0 block)}"
committed_issuer='http://localhost:3005'

rm -f "$dst"/*.json
for f in "$src"/realm-*.json; do
  cp "$f" "$dst/"
done

# Escape the characters that are special in a sed replacement with # as the delimiter.
issuer_sed=$(printf '%s' "$issuer" | sed 's/[#&\\]/\\&/g')
sed -i "s#\"issuer\": \"$committed_issuer\"#\"issuer\": \"$issuer_sed\"#" "$dst/realm-heka.json"
if ! grep -qF "\"issuer\": \"$issuer\"" "$dst/realm-heka.json"; then
  echo "prepare-realms: could not rewrite the heka-sso broker issuer in realm-heka.json" >&2
  exit 1
fi

echo "prepare-realms: realms ready for import, heka-sso broker issuer = $issuer"
ls -l "$dst"
