FROM node:22 AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-sso-service
WORKDIR /opt/heka-sso-service

COPY package*.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
# ui is a yarn workspace — its manifest must be present at install time
COPY ui/package.json ./ui/

RUN yarn install --immutable

COPY . .
# `yarn build` chains the login-page UI build (vite → dist/oidc/pages/ui) and
# the nest build, which copies the hand-authored pages into dist/oidc/pages
RUN yarn build

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install curl -y

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# node:22-bookworm-slim ships an unprivileged 'node' user; the service needs no root privilege,
# and `yarn start` compiles into the working directory, so it owns the whole app directory.
RUN mkdir -p /opt/heka-sso-service && chown node:node /opt/heka-sso-service
WORKDIR /opt/heka-sso-service

COPY --from=builder --chown=node:node /opt/heka-sso-service/migrations ./migrations

COPY --from=builder --chown=node:node /opt/heka-sso-service/dist ./dist
COPY --from=builder --chown=node:node /opt/heka-sso-service/node_modules ./node_modules
COPY --from=builder --chown=node:node /opt/heka-sso-service/package*.json ./
COPY --from=builder --chown=node:node /opt/heka-sso-service/tsconfig*.json ./
COPY --from=builder --chown=node:node /opt/heka-sso-service/yarn.lock ./
COPY --from=builder --chown=node:node /opt/heka-sso-service/.yarn ./.yarn
COPY --from=builder --chown=node:node /opt/heka-sso-service/.yarnrc.yml ./

USER node

CMD ["sh", "-c", "yarn migration:up && yarn start"]
