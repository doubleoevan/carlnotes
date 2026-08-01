#!/usr/bin/env bash
# detects whether Docker Hub has a newer llm-guard-api release than the current tag docker-compose.yml pins.
# .github/workflows/llm-guard-update.yml boots the candidate, measures its false-positive rate on the eval corpus,
# and files the upgrade issue. runs from the repo root, locally or in actions
set -euo pipefail

# the tag the local stack pins. the Northflank service is expected to match it
pinned=$(grep -o 'llm-guard-api:[0-9.]*' docker-compose.yml | cut -d: -f2)
if [[ -z "$pinned" ]]; then
  echo "could not read the pinned llm-guard-api tag from docker-compose.yml" >&2
  exit 1
fi

# the newest release tag on Docker Hub, taking only plain x.y.z tags so that 'latest' and betas never count
latest=$(curl -fsS "https://hub.docker.com/v2/repositories/laiyer/llm-guard-api/tags?page_size=100" |
  jq -r '.results[].name' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
if [[ -z "$latest" ]]; then
  echo "could not read release tags from Docker Hub" >&2
  exit 1
fi

# an update exists only when a tag sorts above the pinned one, so a lower tag never triggers
update=false
if [[ "$(printf '%s\n%s\n' "$pinned" "$latest" | sort -V | tail -1)" != "$pinned" ]]; then
  update=true
fi
echo "pinned $pinned, newest on Docker Hub $latest, update available: $update"

# hand the verdict to the workflow's later steps when running in actions
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "update=$update"
    echo "pinned=$pinned"
    echo "latest=$latest"
  } >>"$GITHUB_OUTPUT"
fi
