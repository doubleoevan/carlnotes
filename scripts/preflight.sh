#!/usr/bin/env bash
set -euo pipefail

# pre-code repo: nothing to gate until bun init lands (phase 3)
if [[ ! -f package.json ]]; then
  echo "preflight: no package.json yet, nothing to gate"
  exit 0
fi

# lint and format check
bunx biome check .

# type-check the whole project via the solution file
bunx tsc -b

# run the test suite
bun test

echo "preflight green"