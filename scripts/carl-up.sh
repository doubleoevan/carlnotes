#!/usr/bin/env bash
set -euo pipefail

# run from the repo root regardless of where the script is called from
cd "$(dirname "$0")/.."

# detect the secrets source once: doppler when authenticated, .env fallback otherwise
HAS_DOPPLER=false
if command -v doppler >/dev/null 2>&1 && doppler me >/dev/null 2>&1; then
  HAS_DOPPLER=true
fi

# read a secret from the active source
get_secret() {
  if [[ "$HAS_DOPPLER" == true ]]; then
    doppler secrets get "$1" --plain 2>/dev/null || true
  else
    grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
  fi
}

# store a secret in the active source
set_secret() {
  if [[ "$HAS_DOPPLER" == true ]]; then
    doppler secrets set "$1=$2" --silent
  else
    # append-only: safe because mint runs only when get_secret is empty and reads head -1; add dedup if .env writes ever expand
    echo "$1=$2" >> .env
  fi
}

# pick the compose wrapper, or fail with both options named
if [[ "$HAS_DOPPLER" == true ]]; then
  # link this clone to the doppler project on first run (doppler.yaml pins carlnotes/dev)
  if ! doppler configure get project --plain >/dev/null 2>&1; then
    doppler setup --no-interactive
  fi
  COMPOSE="doppler run -- docker compose"
elif [[ -f .env ]]; then
  COMPOSE="docker compose"
else
  echo "secrets needed: run 'doppler login' (recommended) or copy .env.example to .env and fill it in" >&2
  exit 1
fi

# ensure jq: dev key minting and the stdin-mode enforcement hooks both need it
if ! command -v jq >/dev/null 2>&1; then
  echo "installing jq (required by the enforcement hooks and dev-key mint)..."
  brew install jq
fi

# route git hooks through the repo so the pre-push gates are always armed
git config core.hooksPath .githooks

# first run: teach the shell the carl commands (idempotent, keyed on the marker line)
SHELL_RC="$HOME/.zshrc"
REPO_ROOT="$(pwd)"
if ! grep -q "# carlnotes aliases" "$SHELL_RC" 2>/dev/null; then
  {
    echo ""
    echo "# carlnotes aliases (added by scripts/carl-up.sh)"
    echo "alias carl-up='bash \"$REPO_ROOT/scripts/carl-up.sh\"'"
    echo "alias carl-down='bash \"$REPO_ROOT/scripts/carl-down.sh\"'"
  } >> "$SHELL_RC"
  echo "installed carl-up / carl-down as shell commands (new terminals from now on)"
fi

# start docker desktop if the daemon is down, wait until it answers
if ! docker info >/dev/null 2>&1; then
  open -a Docker
  # bail after ~60s rather than hang forever if Docker never comes up
  for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "docker did not start within 60s: open Docker Desktop and retry" >&2; exit 1; }
fi

# bring up the litellm proxy with secrets injected
$COMPOSE up -d

# first boot: mint the capped dev key so agents never hold the master key (both paths)
if [[ -z "$(get_secret LITELLM_DEV_KEY)" ]]; then
  # announce, since the health-check wait can take a few seconds on a cold proxy
  echo "no LITELLM_DEV_KEY found: minting a capped dev key (waiting for the proxy)..."

  # wait for the proxy to answer before talking to its admin api; bail after ~60s rather than hang forever
  for _ in $(seq 30); do curl -s http://localhost:4000/health/liveliness >/dev/null 2>&1 && break; sleep 2; done
  curl -s http://localhost:4000/health/liveliness >/dev/null 2>&1 || { echo "proxy did not become healthy within 60s: check 'docker compose logs litellm'" >&2; exit 1; }

  # generate a budget-capped key
  MASTER_KEY="$(get_secret LITELLM_MASTER_KEY)"

  # reclaim the alias first: with the stored secret gone, any proxy-side dev key is an orphan
  curl -s http://localhost:4000/key/delete \
    -H "Authorization: Bearer $MASTER_KEY" \
    -H "Content-Type: application/json" \
    -d '{"key_aliases":["dev"]}' >/dev/null 2>&1 || true

  DEV_KEY="$(curl -s http://localhost:4000/key/generate \
    -H "Authorization: Bearer $MASTER_KEY" \
    -H "Content-Type: application/json" \
    -d '{"key_alias":"dev","max_budget":25,"budget_duration":"30d"}' | jq -r '.key')"

  # refuse to store a failed mint, or the empty check above never fires again
  if [[ -z "$DEV_KEY" || "$DEV_KEY" == "null" ]]; then
    echo "dev key mint failed: check the proxy logs (docker compose logs litellm)" >&2
    exit 1
  fi

  # store it as the agent credential in the active source
  set_secret LITELLM_DEV_KEY "$DEV_KEY"
  echo "minted the capped dev key and stored it as LITELLM_DEV_KEY"
fi

# hand agent tokens to gui apps and new terminals (macos; skipped when absent)
if command -v launchctl >/dev/null 2>&1; then
  for name in LITELLM_DEV_KEY NOTION_TOKEN; do
    value="$(get_secret "$name")"
    if [[ -n "$value" ]]; then
      launchctl setenv "$name" "$value"
    fi
  done
fi

echo "carl is up: http://localhost:4000/ui"