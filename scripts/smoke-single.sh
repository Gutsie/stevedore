#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/examples"
ENV_FILE="$EXAMPLES_DIR/.env"
BACKUP_FILE="$EXAMPLES_DIR/.env.smoke.single.backup"
COMPOSE_FILE="$EXAMPLES_DIR/docker-compose.single.yml"
SECRET="smoke-single-secret-$(date +%s)"

cleanup() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --remove-orphans >/dev/null 2>&1 || true
  if [[ -f "$BACKUP_FILE" ]]; then
    mv "$BACKUP_FILE" "$ENV_FILE"
  else
    rm -f "$ENV_FILE"
  fi
}
trap cleanup EXIT

if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$BACKUP_FILE"
fi
cp "$ROOT_DIR/.env.example" "$ENV_FILE"
sed -i '' "s/^STEVEDORE_SECRET=.*/STEVEDORE_SECRET=$SECRET/" "$ENV_FILE"

echo "==> Building and starting single-file smoke stack"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for /healthz"
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null

echo "==> Triggering webhook deploy"
FIRST_RESPONSE="$(curl -sS -X POST "http://127.0.0.1:8080/hook" -H "Authorization: Bearer $SECRET")"
if [[ "$FIRST_RESPONSE" != *'"ok":true'* ]]; then
  echo "Single-file smoke webhook failed:"
  echo "$FIRST_RESPONSE"
  docker logs examples-stevedore-1 --tail 100 || true
  exit 1
fi

echo "==> Triggering webhook redeploy"
SECOND_RESPONSE="$(curl -sS -X POST "http://127.0.0.1:8080/hook" -H "Authorization: Bearer $SECRET")"
if [[ "$SECOND_RESPONSE" != *'"ok":true'* ]]; then
  echo "Single-file smoke redeploy failed:"
  echo "$SECOND_RESPONSE"
  docker logs examples-stevedore-1 --tail 100 || true
  exit 1
fi

echo "==> Verifying deployed whoami container is running"
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --status running --services | awk '$0 == "whoami" { found=1 } END { exit(found?0:1) }'; then
  echo "Expected whoami service to be running after webhook deploy"
  exit 1
fi

echo "Single-file smoke test passed."
