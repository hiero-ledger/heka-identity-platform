# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (the check matches any ARG whose name contains AUTH; REACT_APP_AUTH_PROVIDER and
# REACT_APP_AUTH_ACCOUNT_URL are a provider name and a page URL)
# Static bundle of heka-identity-service-web-ui served by nginx (root docker-compose.yml).
#
# The app bakes its configuration into the bundle at build time (dotenv-webpack reads ./.env),
# so every REACT_APP_* value is a build arg. The defaults below are the dev Keycloak values and
# only matter for a standalone build; the root Compose file passes every value explicitly.
#
# The nginx server block is shared with heka-sso-web-ui and comes from a second build context:
#   docker build --build-context nginxconf=../docker/nginx -t heka-identity-web-ui .
# (Compose: build.additional_contexts.nginxconf: ../docker/nginx)

FROM node:22-bookworm AS build

# No git inside the build: husky's `prepare` hook must not fail the install.
ENV HUSKY=0 CI=true
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/plugins ./.yarn/plugins
RUN yarn install --immutable

COPY . .

ARG REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
ARG REACT_APP_AUTH_PROVIDER=keycloak
ARG REACT_APP_OIDC_AUTHORITY=http://localhost:8080/realms/heka-platform
ARG REACT_APP_OIDC_CLIENT_ID=heka-identity-web-ui
ARG REACT_APP_OIDC_AUDIENCE=
ARG REACT_APP_OIDC_SCOPE=
ARG REACT_APP_AUTH_ACCOUNT_URL=
ARG REACT_APP_DEMO_USER_DID=

# dotenv-webpack only reads the .env file (systemvars is off), so materialise the non-empty
# build args into it. .dockerignore keeps a developer's own .env out of the build context.
RUN env | grep -E '^REACT_APP_[A-Z0-9_]+=.+' > .env && yarn build:prod

FROM nginx:alpine

COPY --from=nginxconf spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
