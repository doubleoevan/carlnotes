#!/usr/bin/env bash
set -euo pipefail

# run from the repo root regardless of where the script is called from
cd "$(dirname "$0")/.."

# stop the litellm proxy (doppler when authenticated, .env fallback otherwise)
if command -v doppler >/dev/null 2>&1 && doppler me >/dev/null 2>&1; then
  doppler run -- docker compose down
else
  docker compose down
fi

echo "carl is down"