# Used by the root docker-compose.yml (service keycloak-theme-builder, profile
# keycloak) to rebuild the theme jar on every `docker compose up`. Keycloakify
# packages the jar with Maven, so the image needs Node + Maven (maven pulls in
# a Java runtime). The source is mounted at runtime and copied into a working
# volume, not baked into the image.
FROM node:20-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends maven \
    && rm -rf /var/lib/apt/lists/* \
    # Pin the yarn release from package.json's packageManager field so it is
    # not re-downloaded on every container run.
    && corepack enable \
    && corepack prepare yarn@4.16.0 --activate

WORKDIR /theme
