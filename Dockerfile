# Minimal runtime: compiled Stevedore + standalone Compose v2 (Engine API client only — no full docker CLI / buildx).
FROM oven/bun:1-debian AS build

WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
RUN bun install --frozen-lockfile
RUN bun build --compile src/index.ts --outfile /stevedore

FROM debian:bookworm-slim

ARG DOCKER_COMPOSE_VERSION=2.33.0
ARG TARGETARCH
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl; \
  case "${TARGETARCH}" in \
    amd64) COMPOSE_ARCH=x86_64 ;; \
    arm64) COMPOSE_ARCH=aarch64 ;; \
    *) echo "Unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/bin/docker-compose; \
  chmod +x /usr/local/bin/docker-compose; \
  apt-get purge -y curl; \
  apt-get autoremove -y; \
  rm -rf /var/lib/apt/lists/*

COPY --from=build /stevedore /usr/local/bin/stevedore
RUN chmod +x /usr/local/bin/stevedore

ENV NODE_ENV=production \
    STEVEDORE_COMPOSE_CLI=docker-compose

# Mount /var/run/docker.sock and set STEVEDORE_SECRET, STEVEDORE_COMPOSE_PROJECT_DIR at runtime.
CMD ["/usr/local/bin/stevedore"]
