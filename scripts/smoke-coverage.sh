#!/usr/bin/env bash
# run every smoke script under the test runner, so the code they exercise lands in the coverage report.
# each file runs in its own process, since a smoke run ends the shared database pool when it cleans up.
set -u
cd "$(dirname "$0")/.." || exit 1

# the smoke files that need the services docker compose runs: litellm on 4000 for every model and
# embedding call, and temporal on 7233 for the attachment workflow. a machine without them cannot pass
# these, so a runner skips them by name rather than failing on every call
LOCAL_SERVICE_SMOKE_FILES=(
	worker/scan.smoke.ts
	worker/attach.smoke.ts
	worker/search.smoke.ts
	worker/review.smoke.ts
	worker/chat.smoke.ts
	scripts/eval-pipeline.smoke.ts
)

# whether the file needs one of those services
needs_local_service() {
	for local_service_file in "${LOCAL_SERVICE_SMOKE_FILES[@]}"; do
		[ "$local_service_file" = "$1" ] && return 0
	done
	return 1
}

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
skipped=0
for smoke_file in "${SMOKE_FILES[@]}"; do
	# a run with no local services says so, and the skip is named rather than passed over quietly
	if [ "${SMOKE_SKIP_LOCAL_SERVICES:-0}" = "1" ] && needs_local_service "$smoke_file"; then
		echo "=== smoke coverage: $smoke_file skipped, it needs litellm or temporal ==="
		skipped=$((skipped + 1))
		continue
	fi
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

echo "=== smoke coverage done: $failures failed, $skipped skipped ==="
exit "$failures"
