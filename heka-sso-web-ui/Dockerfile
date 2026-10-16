# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (the check matches any ARG whose name contains AUTH; VITE_AUTH_PROVIDER is a provider name)
# Static bundle of heka-sso-web-ui served by nginx (root docker-compose.yml).
#
# Vite inlines VITE_* variables from the process environment at build time, so every value is a
# build arg. The defaults below are the dev Keycloak values and only matter for a standalone
# build; the root Compose file passes every value explicitly. An empty VITE_KC_IDP_HINT is
# meaningful (it shows Keycloak's own login page), so empty args are passed through as-is.
#
# The nginx server block is shared with heka-identity-service-web-ui and comes from a second
# build context:
#   docker build --build-context nginxconf=../docker/nginx -t heka-sso-web-ui .
# (Compose: build.additional_contexts.nginxconf: ../docker/nginx)

FROM node:22-bookworm AS build

ENV CI=true
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN yarn install --immutable

COPY . .

ARG VITE_AUTH_PROVIDER=keycloak
ARG VITE_KC_URL=http://localhost:8080
ARG VITE_KC_REALM=heka
ARG VITE_KC_CLIENT_ID=heka-sso-web-ui
ARG VITE_KC_IDP_HINT=heka-sso
ARG VITE_AUTO_SIGN_IN=true
ARG VITE_AUTH0_DOMAIN=
ARG VITE_AUTH0_CLIENT_ID=
ARG VITE_AUTH0_CONNECTION=

# .dockerignore keeps a developer's own .env out of the build context, so only the args apply.
RUN yarn build

FROM nginx:alpine

COPY --from=nginxconf spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
