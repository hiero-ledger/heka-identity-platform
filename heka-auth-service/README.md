## Heka Auth service

## Description

Authentication service for [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service).

### How to start

#### Locally

1. Run local Postgres database with the following command:
   ```
   bash
   $ docker run --name heka-auth-service-postgres -e POSTGRES_DB=heka-auth-service -e POSTGRES_USER=heka -e POSTGRES_PASSWORD=heka1 -p 5433:5432 -d postgres
   ```
2. Install dependencies:
   ```
   $ yarn install
   ```
3. Run DB migration:
   ```
   $ yarn migration:up
   ```
4. Start service:
   ```
   $ yarn start
   ```

## API

The application offers a REST API that can be accessed at http://localhost:3004 by default.

The API can be explored with using Swagger UI, which is accessible at the http://localhost:3004/api/docs.

## Migrations

To manage db schema we use migrations stored in `./migrations` directory.
You need to call `yarn migration:up` before the first start of Heka Auth Service.

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
## Docker

To build image locally, run:
```shell
docker compose -f docker-compose.dev.yml build
```

Run service in Docker:
```shell
docker compose -f docker-compose.dev.yml up -d
```
