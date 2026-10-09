#!/usr/bin/env bash
# Creates the heka-identity-service recipe in an Auth0 tenant with the Auth0 CLI (https://github.com/auth0/auth0-cli):
# API, SPA application for the web UI, machine-to-machine applications for heka-sso-service and for the
# identity service's demo-token broker (heka-demo), Heka roles,
# the two Actions with their trigger bindings, a username/password connection that accepts usernames,
# and (optionally) the dev `demo` (User) and `admin` (Admin) users. Re-running is safe: existing resources are
# reused by name, and the role settings below (application metadata, Action secrets, API token lifetime,
# dev users' app_metadata) are re-applied to them.
#
# Role defaults: new users get User, the heka-sso-service application is OrgAdmin of its own organization
# (SSO_ORG_ID), the heka-demo application (whose token is public) is User. Admin is never a default: every Admin
# acts in the one shared Administration wallet of heka-identity-service.
#
# Prerequisites: `auth0 login --scopes create:organization_connections,create:organization_members,create:organization_member_roles,read:organization_member_roles`
# against the target tenant (interactive; the default CLI scopes cannot enable a connection for an organization), `node` on the PATH.
# Environment overrides (all optional):
#   HEKA_AUDIENCE         API identifier                       (default https://heka-identity)
#   HEKA_CLAIM_NAMESPACE  custom-claim prefix                  (default https://heka)
#   HEKA_DEFAULT_ROLE     role for users without one           (default User)
#   SSO_ORG_ID            organization of heka-sso-service     (default heka-sso)
#   WEB_UI_ORIGIN         web UI origin                        (default http://localhost:8000)
#   DB_CONNECTION         database connection name             (default Username-Password-Authentication)
#   ACTION_RUNTIME        Actions runtime                      (default node22)
#   CREATE_DEMO_USER      create demo and admin, both Password1234!  (default true)
#
# Status: exercised only through unit tests and a mock issuer so far (docs/keycloak-replacement-for-auth-service.md,
# phase 3). Run it against a dev tenant first and check the printed summary.
set -euo pipefail

HEKA_AUDIENCE="${HEKA_AUDIENCE:-https://heka-identity}"
HEKA_CLAIM_NAMESPACE="${HEKA_CLAIM_NAMESPACE:-https://heka}"
HEKA_DEFAULT_ROLE="${HEKA_DEFAULT_ROLE:-User}"
SSO_ORG_ID="${SSO_ORG_ID:-heka-sso}"
WEB_UI_ORIGIN="${WEB_UI_ORIGIN:-http://localhost:8000}"
DB_CONNECTION="${DB_CONNECTION:-Username-Password-Authentication}"
ACTION_RUNTIME="${ACTION_RUNTIME:-node22}"
CREATE_DEMO_USER="${CREATE_DEMO_USER:-true}"
DEMO_USER_HEKA_UID="d3a1c2b4-5e6f-4a7b-8c9d-0e1f2a3b4c5d"    # same fixed id as the `demo` user in the Keycloak realm
DEMO_ACCOUNT_HEKA_UID="e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9" # same fixed id as the `heka-demo` service account there
ADMIN_USER_HEKA_UID="a7d1e2f3-b4c5-4d6e-8f70-81a2b3c4d5e6"   # same fixed id as the `admin` user there
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export AUTH0_CLI_AGENT_MODE=1 # JSON output, no prompts

json() { node -e "$1" "${@:2}"; }                   # tiny jq replacement: node -e <script> <args>
api() { auth0 api "$@" 2>/dev/null; }               # Management API passthrough

# --- 1. API (resource server) -------------------------------------------------
echo "== API ${HEKA_AUDIENCE}"
API_JSON="$(auth0 apis list --json 2>/dev/null | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(a.find(x=>x.identifier===process.argv[1])||null))' "$HEKA_AUDIENCE")"
if [ "$API_JSON" = "null" ]; then
  auth0 apis create --name heka-identity-service --identifier "$HEKA_AUDIENCE" --signing-alg RS256 \
    --token-lifetime 3600 --offline-access=true --json >/dev/null
  echo "   created"
else
  # A role change in Auth0 reaches heka-identity-service with the next access token, so keep it short.
  API_ID="$(printf '%s' "$API_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).id)')"
  api patch "resource-servers/${API_ID}" --data '{"token_lifetime":3600}' >/dev/null
  echo "   exists, token lifetime 3600 s"
fi

# --- 2. Roles (optional way of assigning the Heka role to users) ----------------
echo "== Roles"
ROLES_JSON="$(auth0 roles list --json 2>/dev/null)"
for role in Admin OrgAdmin OrgManager OrgMember Issuer Verifier User; do
  if [ "$(printf '%s' "$ROLES_JSON" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a.some(r=>r.name===process.argv[1]))' "$role")" = "true" ]; then
    echo "   $role exists"
  else
    auth0 roles create --name "$role" --description "Heka role ${role} (heka-identity-service)" --json >/dev/null
    echo "   $role created"
  fi
done

# --- 3. SPA application for heka-identity-service-web-ui ------------------------
echo "== Application heka-identity-web-ui (SPA)"
APPS_JSON="$(auth0 apps list --json 2>/dev/null)"
find_app() { printf '%s' "$APPS_JSON" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));const x=a.find(c=>c.name===process.argv[1]);console.log(x?x.client_id:"")' "$1"; }
SPA_ID="$(find_app heka-identity-web-ui)"
if [ -z "$SPA_ID" ]; then
  SPA_ID="$(auth0 apps create --name heka-identity-web-ui --type spa --description "Heka Identity Service Web UI" \
    --callbacks "${WEB_UI_ORIGIN}/" --logout-urls "${WEB_UI_ORIGIN}/" --origins "$WEB_UI_ORIGIN" --web-origins "$WEB_UI_ORIGIN" \
    --json 2>/dev/null | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_id)')"
  echo "   created ${SPA_ID}"
else
  echo "   exists ${SPA_ID}"
fi
# Code + refresh-token grants only (no implicit), refresh-token rotation on
# (oidc-client-ts renews with refresh tokens, not iframes). Set via the API: `apps create --grants`
# is merged with the SPA defaults and Auth0 then rejects the duplicated entries.
api patch "clients/${SPA_ID}" --data '{"oidc_conformant":true,"grant_types":["authorization_code","refresh_token"],"refresh_token":{"rotation_type":"rotating","expiration_type":"expiring","token_lifetime":2592000,"idle_token_lifetime":1296000,"leeway":0,"infinite_token_lifetime":false,"infinite_idle_token_lifetime":false}}' >/dev/null
echo "   grants: authorization_code + refresh_token, rotation on"

# --- 4. Machine-to-machine application for heka-sso-service ---------------------
# OrgAdmin of its own organization: its verifier and signing DID live in Organization_${SSO_ORG_ID}, not in the
# shared Administration wallet. Not Verifier: with ROLE_MODEL_ENABLED=true only Admin, OrgAdmin and Issuer can
# create the signing DID.
echo "== Application heka-sso-service (M2M)"
M2M_ID="$(find_app heka-sso-service)"
if [ -z "$M2M_ID" ]; then
  M2M_JSON="$(auth0 apps create --name heka-sso-service --type m2m --description "Heka SSO Service service account" \
    --metadata "heka_role=OrgAdmin" --metadata "org_id=${SSO_ORG_ID}" --reveal-secrets --json 2>/dev/null)"
  M2M_ID="$(printf '%s' "$M2M_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_id)')"
  M2M_SECRET="$(printf '%s' "$M2M_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_secret)')"
  echo "   created ${M2M_ID}"
else
  M2M_SECRET="(existing application: read it in the dashboard)"
  api patch "clients/${M2M_ID}" --data "{\"client_metadata\":{\"heka_role\":\"OrgAdmin\",\"org_id\":\"${SSO_ORG_ID}\"}}" >/dev/null
  echo "   exists ${M2M_ID}"
fi
echo "   heka_role=OrgAdmin, org_id=${SSO_ORG_ID}"
# Grant it the API (no scopes; the role comes from the application metadata via the Action).
if [ "$(api get client-grants --query "client_id=${M2M_ID}" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a.some(g=>g.audience===process.argv[1]))' "$HEKA_AUDIENCE")" != "true" ]; then
  api post client-grants --data "{\"client_id\":\"${M2M_ID}\",\"audience\":\"${HEKA_AUDIENCE}\",\"scope\":[]}" >/dev/null
  echo "   client grant created"
else
  echo "   client grant exists"
fi

# --- 4b. Machine-to-machine application for the identity service's demo-token broker ----
# The web UI's public demo pages act as this account (GET /demo/token). Fixed heka_uid = the id of
# the heka-demo service account in the Keycloak realm, so the demo tenant/DID is the same on both.
# Its token is handed out without login, so it is a User: never Admin, which would open the shared
# Administration wallet to every visitor.
echo "== Application heka-demo (M2M)"
DEMO_ID="$(find_app heka-demo)"
if [ -z "$DEMO_ID" ]; then
  DEMO_JSON="$(auth0 apps create --name heka-demo --type m2m --description "Heka demo service account (identity service demo-token broker)" \
    --metadata "heka_role=User" --metadata "heka_uid=${DEMO_ACCOUNT_HEKA_UID}" --metadata "heka_name=demo" --reveal-secrets --json 2>/dev/null)"
  DEMO_ID="$(printf '%s' "$DEMO_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_id)')"
  DEMO_SECRET="$(printf '%s' "$DEMO_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_secret)')"
  echo "   created ${DEMO_ID}"
else
  DEMO_SECRET="(existing application: read it in the dashboard)"
  api patch "clients/${DEMO_ID}" --data "{\"client_metadata\":{\"heka_role\":\"User\",\"heka_uid\":\"${DEMO_ACCOUNT_HEKA_UID}\",\"heka_name\":\"demo\"}}" >/dev/null
  echo "   exists ${DEMO_ID}"
fi
echo "   heka_role=User"
if [ "$(api get client-grants --query "client_id=${DEMO_ID}" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a.some(g=>g.audience===process.argv[1]))' "$HEKA_AUDIENCE")" != "true" ]; then
  api post client-grants --data "{\"client_id\":\"${DEMO_ID}\",\"audience\":\"${HEKA_AUDIENCE}\",\"scope\":[]}" >/dev/null
  echo "   client grant created"
else
  echo "   client grant exists"
fi

# --- 4c. Machine-to-machine application for delegated organization administration ----
# heka-identity-service calls the Management API with it when an OrgAdmin changes a member's role in their own
# organization (ORG_ADMIN_* settings). Only the scopes for organizations, memberships, roles and users.
echo "== Application heka-identity-admin (M2M, Management API)"
TENANT_DOMAIN="$(auth0 tenants list --json 2>/dev/null | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));const t=a.find(x=>x.active)||a[0];console.log(t?t.name:"")')"
MGMT_AUDIENCE="https://${TENANT_DOMAIN}/api/v2/"
ORG_ADMIN_SCOPES='["read:organizations","read:organization_members","read:organization_member_roles","create:organization_member_roles","delete:organization_member_roles","read:roles","read:users"]'
ADMIN_APP_ID="$(find_app heka-identity-admin)"
if [ -z "$ADMIN_APP_ID" ]; then
  ADMIN_JSON="$(auth0 apps create --name heka-identity-admin --type m2m --description "Heka Identity Service organization administration (Management API)" \
    --reveal-secrets --json 2>/dev/null)"
  ADMIN_APP_ID="$(printf '%s' "$ADMIN_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_id)')"
  ADMIN_APP_SECRET="$(printf '%s' "$ADMIN_JSON" | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).client_secret)')"
  echo "   created ${ADMIN_APP_ID}"
else
  ADMIN_APP_SECRET="(existing application: read it in the dashboard)"
  echo "   exists ${ADMIN_APP_ID}"
fi
GRANT_ID="$(api get client-grants --query "client_id=${ADMIN_APP_ID}" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));const g=a.find(x=>x.audience===process.argv[1]);console.log(g?g.id:"")' "$MGMT_AUDIENCE")"
if [ -z "$GRANT_ID" ]; then
  api post client-grants --data "{\"client_id\":\"${ADMIN_APP_ID}\",\"audience\":\"${MGMT_AUDIENCE}\",\"scope\":${ORG_ADMIN_SCOPES}}" >/dev/null
  echo "   Management API grant created"
else
  api patch "client-grants/${GRANT_ID}" --data "{\"scope\":${ORG_ADMIN_SCOPES}}" >/dev/null
  echo "   Management API grant updated"
fi

# --- 5. Actions ---------------------------------------------------------------
ensure_action() { # name trigger file
  local name="$1" trigger="$2" file="$3" id
  id="$(auth0 actions list --json 2>/dev/null | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));const x=a.find(c=>c.name===process.argv[1]);console.log(x?x.id:"")' "$name")"
  if [ -z "$id" ]; then
    id="$(auth0 actions create --name "$name" --trigger "$trigger" --runtime "$ACTION_RUNTIME" --code "$(cat "$file")" \
      --secret "HEKA_AUDIENCE=${HEKA_AUDIENCE}" --secret "HEKA_CLAIM_NAMESPACE=${HEKA_CLAIM_NAMESPACE}" --secret "HEKA_DEFAULT_ROLE=${HEKA_DEFAULT_ROLE}" \
      --json 2>/dev/null | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).id)')"
    echo "   ${name} created ${id}"
  else
    # Code and secrets: an Action created by an earlier run may still carry HEKA_DEFAULT_ROLE=Admin
    api patch "actions/actions/${id}" --data "$(json '
      const [file,audience,namespace,defaultRole]=process.argv.slice(1);
      console.log(JSON.stringify({code:require("fs").readFileSync(file,"utf8"),secrets:[
        {name:"HEKA_AUDIENCE",value:audience},{name:"HEKA_CLAIM_NAMESPACE",value:namespace},{name:"HEKA_DEFAULT_ROLE",value:defaultRole}]}))' \
      "$file" "$HEKA_AUDIENCE" "$HEKA_CLAIM_NAMESPACE" "$HEKA_DEFAULT_ROLE")" >/dev/null
    echo "   ${name} code and secrets updated ${id}"
  fi
  auth0 actions deploy "$id" --json >/dev/null 2>&1
  echo "   ${name} deployed"
  # Bind to the trigger without dropping bindings that other Actions (e.g. the SSO demo) already have.
  local bindings
  bindings="$(api get "actions/triggers/${trigger}/bindings" | json '
    const cur=JSON.parse(require("fs").readFileSync(0,"utf8")).bindings||[];const id=process.argv[1],name=process.argv[2];
    const list=cur.map(b=>({ref:{type:"action_id",value:b.action.id},display_name:b.display_name}));
    if(!list.some(b=>b.ref.value===id)) list.push({ref:{type:"action_id",value:id},display_name:name});
    console.log(JSON.stringify({bindings:list}))' "$id" "$name")"
  api patch "actions/triggers/${trigger}/bindings" --data "$bindings" >/dev/null
  echo "   ${name} bound to ${trigger}"
}
echo "== Actions"
ensure_action heka-identity-claims post-login "${HERE}/actions/post-login.js"
ensure_action heka-identity-m2m-claims credentials-exchange "${HERE}/actions/credentials-exchange.js"

# --- 6. Database connection: username login, password policy, enabled for both apps
echo "== Connection ${DB_CONNECTION}"
CONN_JSON="$(api get connections --query "name=${DB_CONNECTION}" --query "strategy=auth0")"
CONN_ID="$(printf '%s' "$CONN_JSON" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a[0]?a[0].id:"")')"
if [ -z "$CONN_ID" ]; then
  echo "   not found: create a database connection named ${DB_CONNECTION} in the dashboard and re-run" >&2
  exit 1
fi
# Username login + the heka-auth-service password rule (7+ chars, upper, lower, digit, symbol).
# Tenants either use the newer `password_options` schema or the legacy `passwordPolicy` fields;
# Auth0 rejects a payload that sets both.
CONN_PATCH="$(printf '%s' "$CONN_JSON" | json '
  const c=JSON.parse(require("fs").readFileSync(0,"utf8"))[0];const options={...(c.options||{}),requires_username:true};
  if (options.password_options) {
    options.password_options={...options.password_options,complexity:{...(options.password_options.complexity||{}),
      min_length:7,character_types:["lowercase","uppercase","number","special"],character_type_rule:"all"}};
  } else {
    options.passwordPolicy="good";
    options.password_complexity_options={...(options.password_complexity_options||{}),min_length:7};
  }
  console.log(JSON.stringify({options}))')"
api patch "connections/${CONN_ID}" --data "$CONN_PATCH" >/dev/null
echo "   username login on, password rule 7+ chars with upper/lower/digit/symbol"
# Enable the connection for both applications (dedicated endpoint; `enabled_clients` is deprecated).
api patch "connections/${CONN_ID}/clients" --data "[{\"client_id\":\"${SPA_ID}\",\"status\":true},{\"client_id\":\"${M2M_ID}\",\"status\":true}]" >/dev/null
echo "   enabled for both applications"

# --- 6b. Organizations: organization login on the SPA, and the heka-sso organization ------------
# A login through an organization carries that organization's metadata.heka_org_id as org_id and the roles of the
# membership (see actions/post-login.js). "allow" keeps logins without an organization working (Admin, User).
echo "== Organizations"
api patch "clients/${SPA_ID}" --data '{"organization_usage":"allow","organization_require_behavior":"no_prompt"}' >/dev/null
echo "   SPA: organization login allowed (optional)"
ORG_JSON="$(api get "organizations/name/${SSO_ORG_ID}" || true)" # 404 until it exists
ORG_ID="$(printf '%s' "$ORG_JSON" | json 'let o={};try{o=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{};console.log(o&&o.id?o.id:"")')"
if [ -z "$ORG_ID" ]; then
  ORG_ID="$(api post organizations --data "{\"name\":\"${SSO_ORG_ID}\",\"display_name\":\"${SSO_ORG_ID}\",\"metadata\":{\"heka_org_id\":\"${SSO_ORG_ID}\"}}" \
    | json 'let o={};try{o=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{};console.log(o&&o.id?o.id:"")')"
  [ -n "$ORG_ID" ] && echo "   organization ${SSO_ORG_ID} created ${ORG_ID}"
else
  api patch "organizations/${ORG_ID}" --data "{\"metadata\":{\"heka_org_id\":\"${SSO_ORG_ID}\"}}" >/dev/null
  echo "   organization ${SSO_ORG_ID} exists ${ORG_ID}"
fi
if [ -n "$ORG_ID" ]; then
  echo "   metadata.heka_org_id=${SSO_ORG_ID}"
  # Without an enabled connection, every login through the organization fails with
  # "no connections enabled for the organization". Already enabled: Auth0 answers 409, which is fine.
  api post "organizations/${ORG_ID}/enabled_connections" --data "{\"connection_id\":\"${CONN_ID}\",\"assign_membership_on_login\":false}" >/dev/null || true
  if [ "$(api get "organizations/${ORG_ID}/enabled_connections" | json 'let a=[];try{a=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{};console.log(a.some(c=>c.connection_id===process.argv[1]))' "$CONN_ID")" = "true" ]; then
    echo "   connection ${DB_CONNECTION} enabled for the organization"
  else
    echo "   WARNING: could not enable connection ${DB_CONNECTION} for ${SSO_ORG_ID}. Log in with the organization scopes" >&2
    echo "   (see README, Organizations) or enable it in the dashboard: Organizations -> ${SSO_ORG_ID} -> Connections." >&2
  fi
else
  echo "   could not create organization ${SSO_ORG_ID} (does the tenant's plan include Organizations?)" >&2
fi

# --- 7. Tenant: let oidc-client-ts discover end_session_endpoint for logout -------
api patch tenants/settings --data '{"oidc_logout":{"rp_logout_end_session_endpoint_discovery":true}}' >/dev/null
echo "== Tenant: RP-initiated logout end_session_endpoint discovery on"

# --- 8. Dev demo user (optional) ----------------------------------------------
if [ "$CREATE_DEMO_USER" = "true" ]; then
  echo "== User demo"
  # Looked up by its synthetic email: the CLI's `--query` flag does not pass Lucene `q=` filters through.
  DEMO_USER_ID="$(api get users-by-email --query "email=demo@heka.invalid" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a[0]?a[0].user_id:"")')"
  if [ -z "$DEMO_USER_ID" ]; then
    DEMO_USER_ID="$(auth0 users create --connection-name "$DB_CONNECTION" --username demo --name demo --email demo@heka.invalid \
      --password 'Password1234!' --json 2>/dev/null | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).user_id)')"
    echo "   created ${DEMO_USER_ID}"
  else
    echo "   exists ${DEMO_USER_ID}"
  fi
  api patch "users/${DEMO_USER_ID}" --data "{\"app_metadata\":{\"heka_uid\":\"${DEMO_USER_HEKA_UID}\",\"heka_role\":\"User\"}}" >/dev/null
  echo "   app_metadata.heka_uid=${DEMO_USER_HEKA_UID}, heka_role=User"

  # Dev platform operator: the only default account with Admin
  echo "== User admin"
  ADMIN_ID="$(api get users-by-email --query "email=admin@heka.invalid" | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(a[0]?a[0].user_id:"")')"
  if [ -z "$ADMIN_ID" ]; then
    ADMIN_ID="$(auth0 users create --connection-name "$DB_CONNECTION" --username admin --name admin --email admin@heka.invalid \
      --password 'Password1234!' --json 2>/dev/null | json 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).user_id)')"
    echo "   created ${ADMIN_ID}"
  else
    echo "   exists ${ADMIN_ID}"
  fi
  api patch "users/${ADMIN_ID}" --data "{\"app_metadata\":{\"heka_uid\":\"${ADMIN_USER_HEKA_UID}\",\"heka_role\":\"Admin\"}}" >/dev/null
  echo "   app_metadata.heka_uid=${ADMIN_USER_HEKA_UID}, heka_role=Admin"
fi

# --- Summary -------------------------------------------------------------------
DOMAIN="$(auth0 tenants list --json 2>/dev/null | json 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));const t=a.find(x=>x.active)||a[0];console.log(t?t.name:"<tenant>.<region>.auth0.com")')"
cat <<EOF

Done. Users who signed in before HEKA_DEFAULT_ROLE was User keep the role the post-login Action persisted
in app_metadata.heka_role (usually Admin): reassign everyone who isn't a platform operator to User.

Settings for the platform components:

heka-identity-service (.env)
  OIDC_ISSUER_URL=https://${DOMAIN}/
  OIDC_AUDIENCE=${HEKA_AUDIENCE}
  OIDC_CLAIM_USER_ID=${HEKA_CLAIM_NAMESPACE}/heka_uid
  OIDC_CLAIM_ROLES=${HEKA_CLAIM_NAMESPACE}/roles
  OIDC_CLAIM_NAME=${HEKA_CLAIM_NAMESPACE}/name,name,nickname
  OIDC_CLAIM_ORG_ID=${HEKA_CLAIM_NAMESPACE}/org_id

heka-identity-service-web-ui (phase 5)
  REACT_APP_AUTH_PROVIDER=auth0
  REACT_APP_OIDC_AUTHORITY=https://${DOMAIN}/
  REACT_APP_OIDC_CLIENT_ID=${SPA_ID}
  REACT_APP_OIDC_AUDIENCE=${HEKA_AUDIENCE}

heka-sso-service (phase 4)
  IDENTITY_SERVICE_TOKEN_URL=https://${DOMAIN}/oauth/token
  IDENTITY_SERVICE_CLIENT_ID=${M2M_ID}
  IDENTITY_SERVICE_CLIENT_SECRET=${M2M_SECRET}
  IDENTITY_SERVICE_TOKEN_PARAMS={"audience":"${HEKA_AUDIENCE}"}

heka-identity-service demo-token broker (phase 6)
  DEMO_TOKEN_URL=https://${DOMAIN}/oauth/token
  DEMO_CLIENT_ID=${DEMO_ID}
  DEMO_CLIENT_SECRET=${DEMO_SECRET}
  DEMO_TOKEN_PARAMS={"audience":"${HEKA_AUDIENCE}"}

heka-identity-service organization administration (OrgAdmins manage their organization's members)
  ORG_ADMIN_PROVIDER=auth0
  ORG_ADMIN_URL=https://${DOMAIN}
  ORG_ADMIN_CLIENT_ID=${ADMIN_APP_ID}
  ORG_ADMIN_CLIENT_SECRET=${ADMIN_APP_SECRET}
EOF
