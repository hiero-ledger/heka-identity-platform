# Setup and Configuration

## Setup locally

To run Heka Identity Service locally, follow these steps:

1. Install `Node.js` and `Yarn` package manager
2. Clone the Heka Identity Platform repository by executing the following command in your terminal:

   ```bash
   git clone https://github.com/hiero-ledger/heka-identity-platform.git
   ```

3. Navigate to the heka-identity-service folder in repository:

   ```bash
    cd heka-identity-platform/heka-identity-service
   ```

4. Install the project dependencies by running the following command:

   ```bash
   yarn install
   ```

5. Configure persistent storage. You can find information on how to configure it in the [Persistence](#persistence)
   and [Migrations](#migrations) sections.
6. Run the server as described in the [Run the app](#run-the-app)

## Auth Service

Identity Service endpoints are protected with JWT Authentication and require integration with OAuth 2.0 Authorization Server.

You can modify JWT verification options by setting the following environment variables:
- `JWT_SECRET` - secret used to sign and verify tokens, defaults to `test`
- `JWT_VERIFY_OPTIONS_ISSUER` - required value of `iss` claim, defaults to `Heka`
- `JWT_VERIFY_OPTIONS_AUDIENCE` - required value of `aud` claim, defaults to `Heka Identity Platform`

While integration with external auth providers is supported, it's recommended to use [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service) for basic deployments.

## Mediator

Heka Identity Service can also function as a Credo Mediator. To enable this functionality
set `AGENT_AUTO_ACCEPT_MEDIATION_REQUESTS` environment variable to `true`

## Persistence

For persistence this backend uses `MikroORM` with `Postgres` and requires access to pre-configured `Postgres` instance.
To start `postgres` compatible with default settings in docker use the following command:

```bash
# Starting container
 docker run --name heka-identity-service-postgres -e POSTGRES_DB=heka-identity-service -e POSTGRES_USER=heka -e POSTGRES_PASSWORD=heka1 -p 5432:5432 -d postgres
```

You can also reconfigure how the Heka Identity Service connects to PostgreSQL by setting the following environment variables:

- `MIKRO_ORM_HOST`: The hostname of the PostgreSQL server. By default, it is set to `localhost`
- `MIKRO_ORM_PORT`: The port number on which the PostgreSQL server is listening. By default, it is set to `5432`
- `MIKRO_ORM_USER`: The username to use when connecting to the PostgreSQL server. By default, it is set to `heka`
- `MIKRO_ORM_PASSWORD`: The password to use when connecting to the PostgreSQL server. By default, it is set to `heka1`
- `MIKRO_ORM_DATABASE`: The name of the database to use in the PostgreSQL server. By default, it is set
  to `heka-identity-service`

In addition, Heka Identity Service stores agent wallets in a PostgreSQL database. You can configure the wallet's PostgreSQL
database by setting the following environment variables:

- `WALLET_POSTGRES_HOST`: The hostname of the wallet's PostgreSQL server. By default, it is set to `localhost`
- `WALLET_POSTGRES_PORT`: The port number on which the wallet's PostgreSQL server is listening. By default, it is set
  to `5432`
- `WALLET_POSTGRES_USER`: The username to use when connecting to the wallet's PostgreSQL server. By default, it is set
  to `heka`
- `WALLET_POSTGRES_PASSWORD`: The password to use when connecting to the wallet's PostgreSQL server. By default, it is
  set to `heka1`

## Migrations

To manage db schema we use migrations stored in `./migrations` directory.
You need to call `yarn migration:up` before the first start of Heka Identity Service.

Commands to manage migrations are:

```bash
# Migrate database to the latest version
$ yarn migration:up

# Migration:up help for advanced options
$ yarn migration:up -- -h

# Migrate one version down. Note we don't support down migrations for the moment and it will fail
$ yarn migration:down

# See list of applied migrations
$ yarn migration:list

# See list of pending migrations
$ yarn migration:pending

# Automatically create new migration as a diff between current database and updated model
$ yarn migration:create

# Drop database schema and migrations table. Note you can skip --drop-migrations-table flag to keep migrations table
# or remove -r to just see help.
$ yarn schema:drop -- --drop-migrations-table -r
```

## Build the app

**NOTICE: There is no need to compile TypeScript code into JavaScript because the application is run by `ts-node` which
directly executes TypeScript code.**

However, if for some reason you still need to compile the application into JavaScript, you can do this using the
following command:

```bash
# Build code
$ yarn build
```

## Docker

To build image locally, run:

```shell
docker compose -f docker-compose.dev.yml build
```

Run service in Docker:

```shell
docker compose -f docker-compose.dev.yml up -d
```

## Run the app

To run the Heka Identity Service app, you can use the following commands:

```bash
# Run in development mode
$ yarn start

# Run in development mode, watch for changes and automatically restart
$ yarn watch

# Run in debug mode
$ yarn debug
```

You can also change the ports that the app listens on by setting the following environment variables:

- `EXPRESS_PORT`: This port is used to provide access to the Heka Identity Service API, WebSocket, and the Swagger UI. The
  default value is 3000.
- `AGENT_HTTP_PORT`: This is the port for DIDComm outbound/inbound messaging. The default value is 3001.
- `AGENT_WS_PORT`: This is the port for DIDComm WebSocket connections. The default value is 3002.

## Test the app

```bash
# Run all tests
$ yarn test
```

## Development tools

```bash
# Perform type check of all source code using TypeScript compiler
$ yarn check-types

# Perform type check of code in `src` directory only
$ yarn check-types:src

# Perform type check of code in `test` directory only
$ yarn check-types:test

# Run linter to perform static analysis of all source code
$ yarn lint

# Run prettier to automatically format all source code
$ yarn format
```
