# Pinned 2026-05-05. To update: docker pull node:18 && docker inspect --format='{{index .RepoDigests 0}}'
FROM node:18@sha256:eb29363371ee2859fad6a3c5af88d4abc6ff7d399addb13b7de3c1f11bdee6b9 AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-auth-service
WORKDIR /opt/heka-auth-service
COPY package*.json yarn.lock ./

RUN yarn install
COPY . .
RUN yarn build

# Pinned 2026-05-05. To update: docker pull node:22-bullseye-slim && docker inspect --format='{{index .RepoDigests 0}}'
FROM node:22-bullseye-slim@sha256:5e435a99bf8a0b5154eed7b421c076688a488c9d066e8b1c89e95904939757ac

RUN apt-get update && apt-get install curl -y

WORKDIR /opt/heka-auth-service

COPY --from=builder /opt/heka-auth-service/migrations ./migrations

COPY --from=builder /opt/heka-auth-service/dist ./dist
COPY --from=builder /opt/heka-auth-service/node_modules ./node_modules
COPY --from=builder /opt/heka-auth-service/package*.json ./
COPY --from=builder /opt/heka-auth-service/tsconfig*.json ./
COPY --from=builder /opt/heka-auth-service/yarn.lock ./

CMD ["sh", "-c", "yarn migration:up && yarn start"]
