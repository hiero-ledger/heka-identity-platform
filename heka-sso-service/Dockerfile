FROM node:22 AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-sso-service
WORKDIR /opt/heka-sso-service

COPY package*.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN yarn install --immutable

COPY . .
RUN yarn build

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install curl -y

WORKDIR /opt/heka-sso-service

COPY --from=builder /opt/heka-sso-service/migrations ./migrations

COPY --from=builder /opt/heka-sso-service/dist ./dist
COPY --from=builder /opt/heka-sso-service/node_modules ./node_modules
COPY --from=builder /opt/heka-sso-service/package*.json ./
COPY --from=builder /opt/heka-sso-service/tsconfig*.json ./
COPY --from=builder /opt/heka-sso-service/yarn.lock ./
COPY --from=builder /opt/heka-sso-service/.yarn ./.yarn
COPY --from=builder /opt/heka-sso-service/.yarnrc.yml ./

CMD ["sh", "-c", "yarn migration:up && yarn start"]
