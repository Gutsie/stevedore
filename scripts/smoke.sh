#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/examples"
ENV_FILE="$EXAMPLES_DIR/.env"
BACKUP_FILE="$EXAMPLES_DIR/.env.smoke.backup"
SECRET="smoke-secret-$(date +%s)"

cleanup() {
  docker compose -f "$EXAMPLES_DIR/docker-compose.yml" down --remove-orphans >/dev/null 2>&1 || true
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

echo "==> Building and starting smoke stack"
docker compose --env-file "$ENV_FILE" -f "$EXAMPLES_DIR/docker-compose.yml" up -d --build

echo "==> Waiting for /healthz"
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null

echo "==> Triggering webhook deploy"
FIRST_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:8080/hook" -H "Authorization: Bearer $SECRET")"
if [[ "$FIRST_RESPONSE" != *'"ok":true'* ]]; then
  echo "Smoke webhook failed:"
  echo "$FIRST_RESPONSE"
  exit 1
fi

echo "==> Triggering webhook redeploy"
SECOND_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:8080/hook" -H "Authorization: Bearer $SECRET")"
if [[ "$SECOND_RESPONSE" != *'"ok":true'* ]]; then
  echo "Smoke redeploy failed:"
  echo "$SECOND_RESPONSE"
  exit 1
fi

echo "==> Verifying deployed whoami container is running"
if ! docker ps --format '{{.Names}}' | awk '$0 == "project-whoami-1" { found=1 } END { exit(found?0:1) }'; then
  echo "Expected project-whoami-1 to be running after webhook deploy"
  exit 1
fi

echo "Smoke test passed."
