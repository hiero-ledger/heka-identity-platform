#!/bin/sh
# One-shot of the root Compose `keycloak` profile (service keycloak-realms). Copies the realm
# files of heka-sso-service/keycloak into the volume Keycloak imports from, and rewrites the
# issuer of the `heka` realm's heka-sso identity provider to SSO_ISSUER_URL, so the broker
# accepts the bridge's tokens whether its issuer is localhost or an https tunnel
# (docs/root-docker-compose-plan.md, section 9.2). Only the issuer changes: the token, JWKS and
# userinfo URLs keep host.docker.internal, the authorize and logout URLs keep localhost.
#
# Keycloak in start-dev has no persistent volume in this stack, so a recreate re-imports the
# files written here; an existing realm is never updated by --import-realm.
set -eu

src=/realms-src
dst=/realms
issuer="${SSO_ISSUER_URL:?SSO_ISSUER_URL must be set (root .env: SSO_SERVICE_OIDC_ISSUER_URL, section 1.[R] or 2.[R])}"
committed_issuer='http://localhost:3005'

rm -f "$dst"/*.json
for f in "$src"/realm-*.json; do
  cp "$f" "$dst/"
done

sed -i "s#\"issuer\": \"$committed_issuer\"#\"issuer\": \"$issuer\"#" "$dst/realm-heka.json"
if ! grep -q "\"issuer\": \"$issuer\"" "$dst/realm-heka.json"; then
  echo "prepare-realms: could not rewrite the heka-sso broker issuer in realm-heka.json" >&2
  exit 1
fi

echo "prepare-realms: realms ready for import, heka-sso broker issuer = $issuer"
ls -l "$dst"
