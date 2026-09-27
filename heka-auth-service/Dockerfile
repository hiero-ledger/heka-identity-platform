FROM node:22@sha256:8a34c4ab3ea2c5cd194f07e317b2a8f09461d3c8b05c4e34c8ccd56d56024c4d AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /opt/heka-auth-service
WORKDIR /opt/heka-auth-service

COPY package*.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN yarn install --immutable

COPY . .
RUN yarn build

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

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
