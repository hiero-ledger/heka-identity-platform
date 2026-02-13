FROM node:18 AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-auth-service
WORKDIR /opt/heka-auth-service
COPY package*.json yarn.lock ./

RUN yarn install
COPY . .
RUN yarn test
RUN yarn build

FROM node:18-bullseye-slim

RUN apt-get update && apt-get install curl -y

WORKDIR /opt/heka-auth-service

COPY --from=builder /opt/heka-auth-service/migrations ./migrations

COPY --from=builder /opt/heka-auth-service/dist ./dist
COPY --from=builder /opt/heka-auth-service/node_modules ./node_modules
COPY --from=builder /opt/heka-auth-service/package*.json ./
COPY --from=builder /opt/heka-auth-service/tsconfig*.json ./
COPY --from=builder /opt/heka-auth-service/yarn.lock ./

CMD ["sh", "-c", "yarn migration:up && yarn start"]
