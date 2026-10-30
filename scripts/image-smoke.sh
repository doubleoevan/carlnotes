#!/usr/bin/env bash
# boot a built app image against an empty Postgres with only dummy settings, and fail unless it migrates, starts, and
# renders. usage: bash scripts/image-smoke.sh <image>. CI's image-smoke job and a local run use the same steps
set -euo pipefail

# the image under test, and the names this run gives its network and containers
image="${1:?usage: bash scripts/image-smoke.sh <image>}"
run_name="carl-smoke-$$"
network="$run_name"
postgres_container="$run_name-postgres"
proxy_container="$run_name-wsproxy"
app_container="$run_name-app"
app_port="${IMAGE_SMOKE_PORT:-3999}"

# Postgres with pgvector, and Neon's WebSocket proxy in front of it, each pinned by digest
postgres_image="pgvector/pgvector@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d"
proxy_image="ghcr.io/neondatabase/wsproxy@sha256:7f2e2149aa6a57ba382a140102fba44f5053f3e44389ccc18adcecf896054efb"

# the dummy settings the image runs with. no Doppler token, so Sentry, Redis, and every vendor stay off
database_url="postgresql://postgres:postgres@$postgres_container:5432/carlnotes?sslmode=disable"
app_settings=(
  -e NODE_ENV=production
  -e PORT=3000
  -e DATABASE_URL="$database_url"
  -e DATABASE_WS_PROXY="$proxy_container:80/v1"
  -e BETTER_AUTH_SECRET=image-smoke-secret-of-32-characters
  -e BETTER_AUTH_URL="http://localhost:$app_port"
)

# print the containers' logs if any step fails, and remove the containers and network however the run ends
on_exit() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo "image smoke failed. container logs follow" >&2
    docker logs "$app_container" >&2 2>&1 || true
    docker logs "$proxy_container" >&2 2>&1 || true
  fi
  docker rm -f "$app_container" "$proxy_container" "$postgres_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap on_exit EXIT

# start Postgres and the proxy on one network, and wait for Postgres to take TCP connections. its first-run setup
# server listens on the socket only
docker network create "$network" >/dev/null
docker run -d --name "$postgres_container" --network "$network" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=carlnotes "$postgres_image" >/dev/null
docker run -d --name "$proxy_container" --network "$network" \
  -e ALLOW_ADDR_REGEX=".*" "$proxy_image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$postgres_container" pg_isready -h 127.0.0.1 -U postgres -d carlnotes >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$postgres_container" pg_isready -h 127.0.0.1 -U postgres -d carlnotes >/dev/null

# migrate the empty database from the image, which also proves the migrate job resolves its packages
docker run --rm --network "$network" "${app_settings[@]}" "$image" bun packages/db/migrate.ts

# start the api as the app service does, without doppler run, and time its boot
docker run -d --name "$app_container" --network "$network" -p "$app_port:3000" "${app_settings[@]}" \
  "$image" bun apps/api/index.ts >/dev/null
boot_started_at=$(date +%s)

# poll liveness for up to 90 seconds, failing early if the container exits
is_live=false
for _ in $(seq 1 90); do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$app_container")" != "true" ]]; then
    echo "the app container exited during boot" >&2
    exit 1
  fi
  if curl -fsS --max-time 5 "http://localhost:$app_port/api/health" >/dev/null 2>&1; then
    is_live=true
    break
  fi
  sleep 1
done
if [[ "$is_live" != "true" ]]; then
  echo "the app never responded to /api/health within 90 seconds" >&2
  exit 1
fi
echo "image smoke: the app booted in $(($(date +%s) - boot_started_at))s"

# request the home page, a public page, and both health routes, and fail on any status but 200
for path in / /plans /api/health /api/health/ready; do
  status=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' "http://localhost:$app_port$path")
  echo "image smoke: $path responded $status"
  if [[ "$status" != "200" ]]; then
    exit 1
  fi
done

# fail if the app container exited after the requests
if [[ "$(docker inspect -f '{{.State.Running}}' "$app_container")" != "true" ]]; then
  echo "the app container exited after the requests" >&2
  exit 1
fi
echo "image smoke green"
