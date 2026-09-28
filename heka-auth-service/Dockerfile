FROM node:26@sha256:a723b54c35a76e947095a20a67d39585bb09c862e6b1adeb8a9f518f95e34fb0 AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-auth-service
WORKDIR /opt/heka-auth-service

COPY package*.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN yarn install --immutable

COPY . .
RUN yarn build

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2

RUN apt-get update && apt-get install curl -y

WORKDIR /opt/heka-auth-service

COPY --from=builder /opt/heka-auth-service/migrations ./migrations

COPY --from=builder /opt/heka-auth-service/dist ./dist
COPY --from=builder /opt/heka-auth-service/node_modules ./node_modules
COPY --from=builder /opt/heka-auth-service/package*.json ./
COPY --from=builder /opt/heka-auth-service/tsconfig*.json ./
COPY --from=builder /opt/heka-auth-service/yarn.lock ./
COPY --from=builder /opt/heka-auth-service/.yarn ./.yarn
COPY --from=builder /opt/heka-auth-service/.yarnrc.yml ./

CMD ["sh", "-c", "yarn migration:up && yarn start"]
