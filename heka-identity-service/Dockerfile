FROM node:22-bullseye-slim@sha256:5736e7ef1f3f2109be7ef8aea0cbdf931804aee9a18c6760507b8ded078b25a9

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
