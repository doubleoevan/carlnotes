#!/usr/bin/env bash
# run every smoke script under the test runner, so the code they exercise lands in the coverage report.
# each file runs in its own process, since a smoke run ends the shared database pool when it cleans up.
set -u
cd "$(dirname "$0")/.." || exit 1

# the smoke files, in the same order the smoke script runs them
SMOKE_FILES=(
	worker/scan.smoke.ts
	worker/store.smoke.ts
	worker/attach.smoke.ts
	worker/search.smoke.ts
	worker/reddit.smoke.ts
	worker/x.smoke.ts
	worker/links.smoke.ts
	worker/review.smoke.ts
	worker/chat.smoke.ts
	scripts/eval-pipeline.smoke.ts
	api/topic/subscriberCounts.smoke.ts
	api/profiles.smoke.ts
	api/team/teams.smoke.ts
	api/chat/room.smoke.ts
	api/chat/rooms.smoke.ts
	api/invite/invites.smoke.ts
)

# each run writes coverage/lcov.info, kept aside per file so one upload can send them all
mkdir -p coverage/smoke
failures=0
for smoke_file in "${SMOKE_FILES[@]}"; do
	echo "=== smoke coverage: $smoke_file ==="
	if ! bun test --coverage --coverage-reporter=lcov "./$smoke_file"; then
		failures=$((failures + 1))
	fi
	# keep this run's report under the smoke file's own name
	name=$(basename "$smoke_file" .smoke.ts)
	if [ -f coverage/lcov.info ]; then
		mv coverage/lcov.info "coverage/smoke/$name.lcov.info"
	fi
done

echo "=== smoke coverage done: $failures failed ==="
exit "$failures"
