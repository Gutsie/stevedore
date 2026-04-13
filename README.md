# Stevedore

Small [Bun](https://bun.sh) service that accepts an HTTP webhook, checks a shared secret, then runs a **configurable shell deploy** (default: `${STEVEDORE_COMPOSE_CLI} pull && ${STEVEDORE_COMPOSE_CLI} up -d`, with optional `-f` flags) against the **Docker daemon** on the host. Intended to run in Docker next to your stack with the socket mounted, or from the host with Bun.

The published **Docker image is minimal**: a **compiled Stevedore binary** plus the **standalone Compose v2** binary only (no full `docker` CLI, no buildx). Compose talks to the daemon over the mounted socket, same idea as tools like Portainer—just a different client binary.

**Warning:** Access to the Docker socket is effectively root on the host. Do not expose the webhook port to untrusted networks without TLS termination, firewall rules, and a strong secret.

## Quick start (local)

```bash
bun install
export STEVEDORE_SECRET='your-long-random-secret'
export STEVEDORE_COMPOSE_PROJECT_DIR='/absolute/path/to/compose/project'
bun run dev
```

```bash
curl -s http://127.0.0.1:8080/healthz
curl -s -X POST http://127.0.0.1:8080/hook \
  -H "Authorization: Bearer your-long-random-secret"
```

Alternative auth header: `X-Stevedore-Secret: your-long-random-secret`.

## Docker

Build (uses [BuildKit](https://docs.docker.com/build/buildkit/) so `TARGETARCH` is set for the Compose download):

```bash
docker build -t stevedore:latest .
```

Run (minimal):

```bash
docker run --rm \
  -e STEVEDORE_SECRET='your-long-random-secret' \
  -e STEVEDORE_COMPOSE_PROJECT_DIR=/project \
  -e STEVEDORE_COMPOSE_FILES=docker-compose.yml \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /path/on/host/with/compose:/project:ro \
  -p 8080:8080 \
  stevedore:latest
```

The container must be able to reach the compose project directory and the socket. Use `:ro` on the project mount if you do not need Compose to write files there.

## Environment variables

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `STEVEDORE_SECRET` | **yes** | — | Shared secret for webhook auth. |
| `STEVEDORE_COMPOSE_PROJECT_DIR` | **yes** | — | Working directory for deploy (`cwd` for the shell). |
| `STEVEDORE_COMPOSE_FILES` | no | — | Comma-separated compose files, e.g. `docker-compose.yml` or `compose.yaml,override.yml`. Passed as repeated `-f` when using the default deploy command. |
| `STEVEDORE_COMPOSE_CLI` | no | `docker compose` | Compose invocation for the default command (any string that works after `sh -c`, e.g. `docker compose` with the Docker CLI plugin, or `docker-compose` for the standalone binary). The Docker image sets `docker-compose` by default. |
| `STEVEDORE_DEPLOY_COMMAND` | no | `${STEVEDORE_COMPOSE_CLI} … pull && … up -d` | Full shell command override (run under `sh -c`). |
| `STEVEDORE_LISTEN_HOST` | no | `0.0.0.0` | HTTP bind address. |
| `STEVEDORE_PORT` | no | `8080` | HTTP port. |
| `STEVEDORE_REQUEST_BODY_MAX_BYTES` | no | `65536` | Max POST body size for `/hook`. |
| `STEVEDORE_DEPLOY_TIMEOUT_MS` | no | `600000` | Kill deploy after this many ms (SIGKILL). Response `504` with `deploy_timeout`. |

## HTTP API

- `GET /healthz` — `200` and `{"ok":true}`.
- `POST /hook` — Requires auth. Runs the deploy command once.
  - `401` — missing/invalid secret.
  - `409` — deploy already running (serialized; no queue in v1).
  - `413` — body too large.
  - `500` — deploy command exited non-zero (stdout/stderr in JSON).
  - `504` — deploy timeout.

The hook body is accepted for forward compatibility (e.g. future registry-specific parsers) but is not interpreted in v1 beyond size limits.

## Example Compose

See [examples/docker-compose.yml](examples/docker-compose.yml) and [examples/stack/docker-compose.yml](examples/stack/docker-compose.yml).

```bash
cd examples
cp ../.env.example .env
# Set STEVEDORE_SECRET in .env
docker compose up -d --build
curl -s http://127.0.0.1:8080/healthz
curl -s -X POST http://127.0.0.1:8080/hook \
  -H "Authorization: Bearer $(grep STEVEDORE_SECRET .env | cut -d= -f2-)"
```

## Scripts

- `bun run dev` — watch mode.
- `bun run start` — run server.
- `bun run typecheck` — `tsc --noEmit`.

## Extending

Deploy logic is isolated in `src/deploy.ts`; HTTP routing in `src/server.ts`. Future versions can add payload parsing, multiple projects, queues, or provider-specific signatures without changing the overall shape.
