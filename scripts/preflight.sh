#!/usr/bin/env bash
set -euo pipefail

# lint and format check
bunx biome check .

# check that every import, package.json, and tsconfig under apps/ and packages/ stays inside its workspace boundary
bun scripts/check-package-boundaries.ts

# check that every Nightshift component contract has an implementation with a story in each app it names, and that an
# app imports a contract only from its implementation, a story, or a test
bun scripts/check-component-parity.ts

# check that every api client capability the web reaches is reachable from the mobile app, or listed in
# apps/mobile/parity.md with its reason, and that no listed row has gone stale
bun scripts/check-client-parity.ts

# type-check the whole project via the solution file. tsc -b only rechecks a project whose own files changed, so a
# lockfile that changed since the last check, or a fresh install, rebuilds every project against the new dependencies
saved_lockfile_hash_path="node_modules/.cache/preflight-lockfile.sha"
lockfile_hash="$(shasum bun.lock)"
if [[ "$lockfile_hash" == "$(cat "$saved_lockfile_hash_path" 2>/dev/null)" ]]; then
  bunx tsc -b
else
  bunx tsc -b --force
  mkdir -p "$(dirname "$saved_lockfile_hash_path")"
  echo "$lockfile_hash" > "$saved_lockfile_hash_path"
fi

# bundle the temporal workflows the way the worker does. tsc resolves imports webpack cannot. this is
# the only check that a workflow file the worker has to load actually loads
bun scripts/check-workflow-bundles.ts

# run the test suite
bun test --coverage

echo "preflight green"