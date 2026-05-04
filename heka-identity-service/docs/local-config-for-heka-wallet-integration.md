# Local Configuration for Heka Wallet Integration

## Problem

- For development purposes, it's important to be able to interact with a local instance of Heka Identity Service from the Heka Wallet mobile app.
- This introduces a common problem with endpoint availability for the mobile app — `localhost` endpoints can't be used for cross-device communication. There are a number of ways to work around this, but it makes sense to provide a common config / guide.

## Solution 1: Shared Wi-Fi Network

The PC running the Identity Service and the mobile wallet **MUST** be connected to the same Wi-Fi network.

1. Obtain the IP address of your host.
2. Override the Identity Service's advertised endpoint URLs to use your host IP instead of `localhost`. These are env-var-driven — set `AGENT_HTTP_ENDPOINT`, `AGENT_WS_ENDPOINT`, and `AGENT_OID4VCI_ENDPOINT` in your `.env` (no source edits needed). See [Setup — Agent Transports](setup.md#agent-transports) for the full list of relevant variables and their defaults.
3. Run the Identity Service.

## Solution 2: ngrok + nginx

- Use [ngrok](https://ngrok.com/) (with a free account) to enable access to your local Heka Identity Service instance from the Heka Wallet — it provides easy setup and usage.
- However, since the Identity Service exposes multiple endpoints, you also need to configure a web server to expose a single port and forward messages to the Identity Service. It's strongly recommended to use [nginx](https://www.nginx.com/) with the configuration below.
  - Note that the Heka Identity Service REST API endpoints (not based on Credo transports) are hosted on a separate port and are not actually needed for Heka Wallet integration, but they are included in the nginx config for completeness.
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

        location /api/ {
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

        location /openId/ {
            proxy_pass http://localhost:{YOUR_IDENTITY_SERVICE_AGENT_OPENID_PORT}/;
        }

        location /auth/ {
            proxy_pass http://localhost:{YOUR_AUTH_SERVICE_PORT}/;
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

Modify the agent endpoints in the Heka Identity Service config via environment variables, for example:

```shell
AGENT_HTTP_ENDPOINT=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/agent-http
AGENT_WS_ENDPOINT=ws://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/agent-ws
AGENT_OID4VCI_ENDPOINT=https://fd31-2a03-ed80-1-0-1c38-8e52-ec9d-30e7.ngrok.io/openId
```

This way the Heka Identity Service will include the ngrok endpoints in OOB invitations and DID documents, making them reachable by the Heka Wallet over the public network.