#!/usr/bin/env bash
# Prepares the SSO bridge verifier wallet and records its DID in the root .env.
# Linux / macOS counterpart of prepare-sso-verifier.ps1. Needs curl and jq.
#
# Obtains a client-credentials token for the heka-sso-service client from Keycloak or Auth0,
# calls POST /prepare-wallet on the identity service and writes the returned DID to
# SSO_SERVICE_IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and SSO_SERVICE_IDENTITY_SERVICE_REQUEST_SIGNER_DID.
#
# The token URL, client id, secret and token params are read from the SSO_SERVICE_IDENTITY_SERVICE_*
# lines of the .env, active or commented out, picking the block whose TOKEN_URL belongs to the
# provider (/realms/ for Keycloak, auth0.com for Auth0). host.docker.internal is replaced with localhost.
# Values are read with the dotenv rules Docker Compose applies to the same file (quotes, inline
# comments); ${VAR} references are not expanded.
#
# Usage:
#   bash docker/prepare-sso-verifier.sh --provider keycloak
#   bash docker/prepare-sso-verifier.sh --provider auth0 --no-update
#
# Options:
#   --provider keycloak|auth0     (required) identity provider that issues the heka-sso-service token
#   --identity-service-url URL    identity service base URL (default: http://localhost:3000)
#   --env-file PATH               .env to read and update (default: <repo root>/.env)
#   --no-update                   print the DID without writing it to the .env
#   -h, --help                    show this help
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
provider=''
identity_service_url='http://localhost:3000'
env_file="$script_dir/../.env"
no_update=false

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }
die() { echo "prepare-sso-verifier: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --provider) provider=${2:-}; shift 2 ;;
    --provider=*) provider=${1#*=}; shift ;;
    --identity-service-url) identity_service_url=${2:-}; shift 2 ;;
    --identity-service-url=*) identity_service_url=${1#*=}; shift ;;
    --env-file) env_file=${2:-}; shift 2 ;;
    --env-file=*) env_file=${1#*=}; shift ;;
    --no-update) no_update=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

case "$provider" in
  keycloak) token_url_pattern='/realms/' ;;
  auth0) token_url_pattern='auth0\.com' ;;
  '') die '--provider keycloak|auth0 is required' ;;
  *) die "unknown provider: $provider (expected keycloak or auth0)" ;;
esac

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required but not installed"
done
[ -f "$env_file" ] || die "Env file not found: $env_file"

# Normalises a raw dotenv value the way Docker Compose reads it: surrounding whitespace is
# trimmed; a single-quoted value is taken literally; a double-quoted value has \" and \\
# unescaped; an unquoted value ends at the first `#` preceded by whitespace.
dotenv_value() {
  local value
  value=$(printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  case $value in
    \'*\') value=${value:1:${#value}-2} ;;
    \"*\")
      value=${value:1:${#value}-2}
      value=${value//\\\"/\"}
      value=${value//\\\\/\\}
      ;;
    *) value=$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//') ;;
  esac
  printf '%s' "$value"
}

# Group the SSO token settings into blocks, each starting at a TOKEN_URL line, and pick the
# first block whose TOKEN_URL belongs to the provider.
token_url='' client_id='' client_secret='' token_params=''
in_block=false
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  if [[ $line =~ ^[[:space:]]*#?[[:space:]]*SSO_SERVICE_IDENTITY_SERVICE_(TOKEN_URL|CLIENT_ID|CLIENT_SECRET|TOKEN_PARAMS)=(.*)$ ]]; then
    key=${BASH_REMATCH[1]}
    value=$(dotenv_value "${BASH_REMATCH[2]}")
    if [ "$key" = TOKEN_URL ]; then
      if [ -n "$token_url" ]; then break; fi
      if [[ $value =~ $token_url_pattern ]]; then
        token_url=$value
        in_block=true
      else
        in_block=false
      fi
    elif $in_block; then
      case "$key" in
        CLIENT_ID) client_id=$value ;;
        CLIENT_SECRET) client_secret=$value ;;
        TOKEN_PARAMS) token_params=$value ;;
      esac
    fi
  fi
done < "$env_file"

[ -n "$token_url" ] || die "No SSO_SERVICE_IDENTITY_SERVICE_TOKEN_URL for $provider found in $env_file"
if [ -z "$client_id" ] || [ -z "$client_secret" ] || [[ $client_secret == \<* ]]; then
  die "Client id or secret for $provider is missing in $env_file"
fi

token_url=${token_url//host.docker.internal/localhost}
[ -n "$token_params" ] || token_params='{}'

# Build the url-encoded token body with jq so the secret never appears on a command line.
token_body=$(jq -rn --arg id "$client_id" --arg secret "$client_secret" --argjson params "$token_params" '
  ({ grant_type: "client_credentials", client_id: $id, client_secret: $secret }
    + ($params | with_entries(.value |= tostring)))
  | to_entries | map("\(.key)=\(.value | @uri)") | join("&")') \
  || die "SSO_SERVICE_IDENTITY_SERVICE_TOKEN_PARAMS is not a JSON object: $token_params"

# Runs curl with the request body or headers passed through a config file on stdin (never argv);
# prints the response body followed by a line with the HTTP status code.
http_post() {
  curl -sS -X POST -K - -w '\n%{http_code}' "$@"
}

echo "Requesting a token for $client_id from $token_url"
out=$(printf 'data = "%s"\n' "$token_body" \
  | http_post -H 'Content-Type: application/x-www-form-urlencoded' "$token_url")
status=${out##*$'\n'}
body=${out%$'\n'*}
[ "$status" = 200 ] || die "Token request failed ($status): $body"
access_token=$(printf '%s' "$body" | jq -r '.access_token // empty')
[ -n "$access_token" ] || die "Token response has no access_token: $body"

prepare_url="${identity_service_url%/}/prepare-wallet"
echo "Preparing the wallet at $prepare_url"
out=$(printf 'header = "Authorization: Bearer %s"\n' "$access_token" \
  | http_post -H 'Content-Type: application/json' --data '{}' "$prepare_url")
status=${out##*$'\n'}
body=${out%$'\n'*}
if [ "$status" = 401 ]; then
  die "Identity service rejected the $provider token (401: $body). Is it running with the $provider IDENTITY_SERVICE_OIDC_* settings?"
fi
[ "$status" = 200 ] || [ "$status" = 201 ] || die "prepare-wallet failed ($status): $body"
did=$(printf '%s' "$body" | jq -r '.did // empty')
[ -n "$did" ] || die "prepare-wallet returned no DID: $body"

printf '\033[32mVerifier DID: %s\033[0m\n' "$did"

if $no_update; then exit 0; fi

# Replaces NAME=... in place (keeping a CRLF line ending) or appends NAME=value at the end.
# The file is rewritten through cat so its permissions and any symlink are preserved.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
set_env_var() {
  local name=$1 value=$2
  if grep -q "^$name=" "$env_file"; then
    awk -v name="$name" -v value="$value" '
      index($0, name "=") == 1 { cr = sub(/\r$/, "") ? "\r" : ""; print name "=" value cr; next }
      { print }' "$env_file" > "$tmp"
  else
    {
      cat "$env_file"
      [ -z "$(tail -c1 "$env_file")" ] || echo
      printf '%s=%s\n' "$name" "$value"
    } > "$tmp"
  fi
  cat "$tmp" > "$env_file"
}
set_env_var SSO_SERVICE_IDENTITY_SERVICE_PUBLIC_VERIFIER_ID "$did"
set_env_var SSO_SERVICE_IDENTITY_SERVICE_REQUEST_SIGNER_DID "$did"

echo "Updated $env_file"
echo 'Apply it with: docker compose up -d heka-sso-service (add --profile keycloak when using Keycloak)'
