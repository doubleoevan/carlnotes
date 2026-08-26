#!/usr/bin/env bash
set -euo pipefail

# lint and format check
bunx biome check .

# type-check the whole project via the solution file
bunx tsc -b

# run the test suite
bun test --coverage

echo "preflight green"