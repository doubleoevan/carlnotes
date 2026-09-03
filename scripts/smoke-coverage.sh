#!/usr/bin/env bash
# run every smoke script under the test runner, so the code they exercise lands in the coverage report.
# each file runs in its own process, since a smoke run ends the shared database pool when it cleans up.
set -u
cd "$(dirname "$0")/.." || exit 1

# the smoke files that only a developer's machine can run: they need litellm on 4000 for their model
# and embedding calls, or temporal on 7233 for the attachment workflow, both of which docker compose
# runs locally. everything else runs anywhere, since it needs only the dev database and the outside apis
DEVELOPER_ONLY_SMOKE_FILES=(
	worker/scan.smoke.ts
	worker/attach.smoke.ts
	worker/search.smoke.ts
	worker/review.smoke.ts
	worker/chat.smoke.ts
	scripts/eval-pipeline.smoke.ts
)

# whether this file is one of them
is_developer_only() {
	for developer_only_file in "${DEVELOPER_ONLY_SMOKE_FILES[@]}"; do
		[ "$developer_only_file" = "$1" ] && return 0
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
	# a run off a developer's machine says so, and each skip is named rather than passed over quietly
	if [ "${SMOKE_SKIP_DEVELOPER_ONLY:-0}" = "1" ] && is_developer_only "$smoke_file"; then
		echo "=== smoke coverage: $smoke_file skipped, it runs only on a developer's machine ==="
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
