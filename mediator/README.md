# DIDComm Mediator

Docker Compose setup for a self-hosted DIDComm mediator used by [Heka Wallet](../heka-wallet).

The mediator is not a Heka-specific service: it runs the [OWF DIDComm Mediator Credo](https://github.com/openwallet-foundation/didcomm-mediator-credo) Docker image, this folder only contains the configuration.

## Why a mediator is needed

A mobile wallet has no stable public address and is often offline, so other agents cannot deliver DIDComm messages to it directly.
The mediator is an always-online "mailbox": the wallet advertises the mediator as its endpoint, issuers / verifiers send messages there, and the wallet picks them up (Message Pickup v2).

Without a mediator the wallet can still initiate DIDComm interactions, but cannot receive inbound DIDComm messages (credential offers, proof requests, etc.).

## Setup

This setup runs a single mediator instance with Postgres used for agent storage and queued messages.

1. Create an `.env` file from the example and adjust the values:

   ```bash
   cp .env.example .env
   ```

   `AGENT_ENDPOINTS` must be reachable **from the mobile device** (see [Reaching the mediator from a device](#reaching-the-mediator-from-a-device)).

   > **Warning.** The default `ASKAR_STORE_KEY` and `POSTGRES_PASSWORD` (`mediator`) are public and meant for local development only.
   > Before exposing the mediator through a tunnel or a public domain, replace both with random values, for example:
   >
   > ```bash
   > openssl rand -base64 32
   > ```
   >
   > Set them before the first start: changing `ASKAR_STORE_KEY` later requires removing the Postgres volume (see the note under [Configuration](#configuration)).

2. Start the mediator:

   ```bash
   docker compose up -d
   ```

3. Get the mediator invitation URL from the logs:

   ```bash
   docker compose logs mediator | grep -A 2 "Out of band invitation url"
   ```

   The invitation is created on the first start and reused afterwards, as long as the Postgres volume and the Askar store settings are kept.

   > **Note.** On startup the mediator may log `Error occurred during transaction, rollback` with a `Duplicate entry` / `Store already exists` cause.
   > This is expected when the Askar store has already been created and can be ignored.

4. Set the invitation URL as `MEDIATOR_URL` in the wallet `.env` file (`heka-wallet/app/.env`) and rebuild the wallet app. See [Heka Wallet configuration](../heka-wallet/README.md#didcomm).

## Configuration

| Variable             | Default                                   | Description                                                                                                 |
|----------------------|-------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `AGENT_ENDPOINTS`    | `http://localhost:3110,ws://localhost:3110` | Public mediator endpoints, comma separated. HTTP and WebSocket transports share the same port.              |
| `MEDIATOR_PORT`      | `3110`                                    | Host port the mediator is exposed on.                                                                       |
| `AGENT_NAME`         | `Heka DIDComm Mediator`                   | Mediator label shown in the invitation.                                                                     |
| `LOG_LEVEL`          | `info`                                    | One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `off`.                                           |
| `ASKAR_STORE_ID`     | `mediator`                                | Askar store ID (also used as the Postgres database name).                                                   |
| `ASKAR_STORE_KEY`    | `mediator`                                | Askar store key. Local development only: **replace with a random value** before exposing the mediator.      |
| `POSTGRES_USER`      | `mediator`                                | Postgres user.                                                                                              |
| `POSTGRES_PASSWORD`  | `mediator`                                | Postgres password. Local development only: **replace with a random value** before exposing the mediator.    |
| `MEDIATOR_IMAGE_TAG` | `375518d`                                 | Mediator image tag. Upstream publishes commit-based tags only (`375518d` = `v0.0.2-alpha-20251223125919`). |

> **Note.** Changing `ASKAR_STORE_ID` or removing the Postgres volume creates a new mediator identity and invitation.
> Wallets connected to the previous one will stop receiving messages and need to be reinstalled (or reset) with the new `MEDIATOR_URL`.
>
> `ASKAR_STORE_KEY` encrypts the existing store: if it is changed while the Postgres volume is kept, the mediator cannot open the store and fails to start.
> Keep the original key; to start with a new key, remove the volume first (`docker compose down -v`), which also creates a new mediator identity.

The upstream image supports more options (Redis cache, DynamoDB / dedicated Postgres message queue, multi-instance setup, push notifications).
See the [upstream documentation](https://github.com/openwallet-foundation/didcomm-mediator-credo#configuration) for details.

## Reaching the mediator from a device

`localhost` endpoints only work for an iOS Simulator running on the same machine. For other cases:

- **Device in the same network** - use the machine's LAN IP address, e.g. `AGENT_ENDPOINTS=http://192.168.1.10:3110,ws://192.168.1.10:3110`.
- **Device in any network** - expose the mediator via a tunnel (e.g. ngrok, cloudflared) or deploy it behind a public domain with TLS, e.g. `AGENT_ENDPOINTS=https://mediator.example.com,wss://mediator.example.com`.

Since the endpoints are part of the mediator invitation and of the wallet routing, they should be stable: changing them requires reconnecting the wallets.
Also note that the existing invitation is reused on restart and keeps the old endpoints, so after changing `AGENT_ENDPOINTS` recreate the mediator data (`docker compose down -v && docker compose up -d`) and use the new invitation URL.
