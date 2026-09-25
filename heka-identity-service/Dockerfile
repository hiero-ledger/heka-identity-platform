FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

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
