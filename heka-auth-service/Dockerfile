FROM node:25@sha256:78839ac448c23517f8eab2e8f7943d9b4f73979eb7f8bed2c73dbf72ff869e7b AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-auth-service
WORKDIR /opt/heka-auth-service

COPY package*.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN yarn install --immutable

COPY . .
RUN yarn build

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370

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
