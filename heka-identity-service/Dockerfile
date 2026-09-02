FROM node:26-bullseye-slim@sha256:ce69d6017624735163d253581f6bfa3c8bf6c1eb1640ca71393be122c0716838

ARG EXPRESS_PORT

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update -y && apt-get install -y \
    software-properties-common \
    apt-transport-https \
    curl \
    build-essential \
    libzmq3-dev  \
    pkg-config  \
    libssl-dev

# Copy project
RUN mkdir -p /opt/heka-identity-service
WORKDIR /opt/heka-identity-service
COPY . .

RUN yarn install

CMD ["sh", "-c", "yarn migration:up && yarn start"]
