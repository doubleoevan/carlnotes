#!/usr/bin/env bash
set -euo pipefail

# lint and format check
bunx biome check .

# type-check the whole project via the solution file
bunx tsc -b

# bundle the temporal workflows the way the worker does. tsc resolves imports webpack cannot. this is
# the only check that a workflow file the worker has to load actually loads
bun scripts/check-workflow-bundles.ts

# run the test suite
bun test --coverage

echo "preflight green"