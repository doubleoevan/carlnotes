#!/usr/bin/env bash
set -euo pipefail

# lint and format check
bunx biome check .

# check that the ui imports the api, the worker, and the db folder as types only
bun scripts/check-ui-boundary.ts

# type-check the whole project via the solution file. tsc -b only rechecks a project whose own files changed, so a
# lockfile that changed since the last check, or a fresh install, rebuilds every project against the new dependencies
lockfile_stamp="node_modules/.cache/preflight-lockfile.sha"
lockfile_hash="$(shasum bun.lock)"
if [[ "$lockfile_hash" == "$(cat "$lockfile_stamp" 2>/dev/null)" ]]; then
  bunx tsc -b
else
  bunx tsc -b --force
  mkdir -p "$(dirname "$lockfile_stamp")"
  echo "$lockfile_hash" > "$lockfile_stamp"
fi

# bundle the temporal workflows the way the worker does. tsc resolves imports webpack cannot. this is
# the only check that a workflow file the worker has to load actually loads
bun scripts/check-workflow-bundles.ts

# run the test suite
bun test --coverage

echo "preflight green"