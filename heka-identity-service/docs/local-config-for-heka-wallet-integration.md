# Local Configuration for Heka Wallet Integration

## Problem

- For development purposes, it's important to be able to interact with a local instance of Heka Identity Service from the Heka Wallet mobile app.
- This introduces a common problem with endpoint availability for the mobile app — `localhost` endpoints can't be used for cross-device communication. There are a number of ways to work around this, but it makes sense to provide a common config / guide.

## Solution 1: Shared Wi-Fi Network

The PC running the Identity Service and the mobile wallet **MUST** be connected to the same Wi-Fi network.

1. Obtain the IP address of your host.
2. Override the Identity Service's advertised endpoint URLs to use your host IP instead of `localhost`. These are env-var-driven — set `AGENT_HTTP_ENDPOINT`, `AGENT_WS_ENDPOINT`, `AGENT_OID4VCI_ENDPOINT` and `APP_ENDPOINT` (`http://<host-ip>:3000`, for AnonCreds tails files and status lists) in your `.env` (no source edits needed), or set `EXPRESS_HOST=<host-ip>`, which all four default to. When the service runs from the root `docker-compose.yml`, `EXPRESS_HOST` is not passed through: set `IDENTITY_SERVICE_AGENT_HTTP_ENDPOINT`, `IDENTITY_SERVICE_AGENT_WS_ENDPOINT`, `IDENTITY_SERVICE_AGENT_OID4VCI_ENDPOINT` and `IDENTITY_SERVICE_APP_ENDPOINT` in the root `.env` instead. See [Setup — Agent Transports](setup.md#agent-transports) for the full list of relevant variables and their defaults. Logos still need an https `FILE_STORAGE_FS_PUBLIC_URL`, because wallets reject plain http logo URLs.
3. Run the Identity Service.

## Solution 2: ngrok + nginx

- Use [ngrok](https://ngrok.com/) (with a free account) to enable access to your local Heka Identity Service instance from the Heka Wallet — it provides easy setup and usage.
- However, since the Identity Service exposes multiple endpoints, you also need to configure a web server to expose a single port and forward messages to the Identity Service. It's strongly recommended to use [nginx](https://www.nginx.com/) with the configuration below.
  - The Heka Identity Service REST API (not based on Credo transports) is hosted on a separate port. Wallets only need two public routes from it: AnonCreds tails files (`/revocation/tails/`, required to prove non-revocation) and credential status lists (`/credentials/status/`). Their public base URL is `APP_ENDPOINT`. The config below assumes `EXPRESS_PREFIX` is unset; with a prefix (e.g. `api`) these routes are served under it, so use `location /api/revocation/tails/` and `location /api/credentials/status/` and include the prefix in `APP_ENDPOINT` (`https://<tunnel>/api`).
  - The OID4VC router mounts its routes at the path of the public URL it is given (`AGENT_OID4VCI_ENDPOINT`), so requests under `/openId/oid4vci/` and `/openId/oid4vp/` must be forwarded **with** the `/openId` prefix. Only uploaded files (logos) are served from the root of port `3003`, which is what the prefix-stripping `/openId/` location is for. The same location serves the OCA bundles (credential branding, `files/oca`); to have the Heka Wallet use them, set its `AGENCY_PROVIDER_URL=https://<tunnel>/openId`.
  - Wallets also fetch issuer metadata from `/.well-known/openid-credential-issuer/openId/oid4vci/<issuerId>` (RFC 8414 style), so `/.well-known/` must be forwarded to the OID4VC port as well.
  - If you have a paid ngrok account, you can probably skip nginx and expose multiple ports out of the box.

### nginx Config

```nginx
worker_processes 1;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 6500;

    server {
        listen 9000;

        # REST API endpoints fetched by wallets: AnonCreds tails files and credential status lists
        location /revocation/tails/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_API_PORT};
        }

        location /credentials/status/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_API_PORT};
        }

        location /agent-http {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_PORT}/;
        }

        location /agent-ws {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_WS_PORT}/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }

        # OID4VC router — keep the /openId prefix (routes are mounted under it)
        location /openId/oid4vci/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_OPENID_PORT};
        }

        location /openId/oid4vp/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_OPENID_PORT};
        }

        # uploaded files (logos) served from the root of the OID4VC port — strip the prefix
        location /openId/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_OPENID_PORT}/;
        }

        # issuer / authorization server metadata requested by wallets
        location /.well-known/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_OPENID_PORT};
        }
    }

    include servers/*;
}
```

### ngrok Usage

Run ngrok using the following command (`9000` is the server port used by nginx):

```shell
ngrok http 9000
```

Modify the agent endpoints in the Heka Identity Service config via environment variables (`.env`), for example:

```shell
AGENT_HTTP_ENDPOINT=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/agent-http
AGENT_WS_ENDPOINT=wss://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/agent-ws
AGENT_OID4VCI_ENDPOINT=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/openId
# logos referenced from OID4VCI issuer metadata must be reachable over https too
FILE_STORAGE_FS_PUBLIC_URL=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/openId
# tails files and status lists (REST API port)
APP_ENDPOINT=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io
```

When the Identity Service runs from the root `docker-compose.yml`, set the same values in the root `.env` with the `IDENTITY_SERVICE_` prefix (e.g. `IDENTITY_SERVICE_APP_ENDPOINT`, `IDENTITY_SERVICE_AGENT_HTTP_ENDPOINT`).

Note that ngrok only exposes TLS endpoints, so the WebSocket endpoint must use `wss://`.

This way the Heka Identity Service will include the ngrok endpoints in OOB invitations, DID documents and credential offers, making them reachable by the Heka Wallet over the public network.

Keep in mind that these URLs are persisted at creation time:

- Credential offers and presentation requests embed `AGENT_OID4VCI_ENDPOINT` — recreate QR codes after changing it (and restart the service).
- Logo URLs (`FILE_STORAGE_FS_PUBLIC_URL`) are stored in the issuer metadata when a user profile or a schema is saved — re-save the profile and the schemas after changing it.
- The tails file URL (`APP_ENDPOINT`) is written to the ledger when an AnonCreds schema is registered (revocation registry) — register a new schema after changing it. With the default `http://localhost:3000`, wallets fail to share proofs for such credentials ("Could not connect to the server").
- Status-list URLs (`APP_ENDPOINT`) are written into `credentialStatus` when revocable OID4VC credentials are issued — issue replacement credentials (`POST /openid4vc/issuance-session/offer`) after changing it. Registering a new schema creates a new status list but does not update credentials already issued.
