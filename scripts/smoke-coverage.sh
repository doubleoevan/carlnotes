#!/usr/bin/env bash
# run every smoke file under the test runner, so the code each smoke file exercises is included in the coverage report.
# each file runs in its own process, since a smoke run ends the shared database pool when it cleans up.
set -u
cd "$(dirname "$0")/.." || exit 1

# the smoke files that only a developer's machine can run: they need litellm on 4000 for their model
# and embedding calls, or temporal on 7233 for the attachment workflow, both of which docker compose
# runs locally. everything else runs anywhere, since it needs only the dev database and the outside apis.
# the podcast episode smoke also needs ffmpeg
DEVELOPER_ONLY_SMOKE_FILES=(
	apps/worker/scan.smoke.ts
	packages/pipeline/attach.smoke.ts
	packages/pipeline/search.smoke.ts
	apps/worker/review.smoke.ts
	packages/pipeline/chat.smoke.ts
	packages/models/speech.smoke.ts
	apps/worker/podcastEpisode.smoke.ts
	evals/review-pipeline/reviewPipelineEval.smoke.ts
)

# whether the file is one of the files listed after it
is_listed() {
	local file=$1
	shift
	for listed_file in "$@"; do
		[ "$listed_file" = "$file" ] && return 0
	done
	return 1
}

# read the smoke files in order from the smoke script in package.json, and stop the run if the read fails partway
if ! smoke_file_lines=$(jq -r '.scripts as $scripts | $scripts.smoke | split(" && ") | .[] | sub("^bun run "; "") | $scripts[.] | capture("(?<smokeFile>[^ \"]+\\.smoke\\.ts)").smokeFile' package.json); then
	echo "=== smoke coverage: could not read the smoke files from package.json's smoke script ==="
	exit 1
fi

# read each line in turn. macOS bash 3.2 has no mapfile
SMOKE_FILES=()
while IFS= read -r smoke_file; do
	[ -n "$smoke_file" ] && SMOKE_FILES+=("$smoke_file")
done <<< "$smoke_file_lines"

# stop the run if the smoke script names no smoke file
if [ "${#SMOKE_FILES[@]}" -eq 0 ]; then
	echo "=== smoke coverage: no smoke files found in package.json's smoke script ==="
	exit 1
fi

# each run writes coverage/lcov.info, kept aside per smoke file so one upload can send them all
mkdir -p coverage/smoke
failures=0
skipped=0
for smoke_file in "${SMOKE_FILES[@]}"; do
	# skip a developer-only smoke file on a run off a developer's machine, and name the skip
	if [ "${SMOKE_SKIP_DEVELOPER_ONLY:-0}" = "1" ] && is_listed "$smoke_file" "${DEVELOPER_ONLY_SMOKE_FILES[@]}"; then
		echo "=== smoke coverage: $smoke_file skipped, it runs only on a developer's machine ==="
		skipped=$((skipped + 1))
		continue
	fi
	echo "=== smoke coverage: $smoke_file ==="
	if ! bun test --coverage --coverage-reporter=lcov "./$smoke_file"; then
		failures=$((failures + 1))
	fi
	# keep this run's report in its own directory, still named lcov.info. codecov searches for that name,
	# and finds nothing under a name like scan.lcov.info, which is why the smoke flag uploaded no reports
	name=$(basename "$smoke_file" .smoke.ts)
	if [ -f coverage/lcov.info ]; then
		mkdir -p "coverage/smoke/$name"
		mv coverage/lcov.info "coverage/smoke/$name/lcov.info"
	fi
done

echo "=== smoke coverage done: $failures failed, $skipped skipped ==="
exit "$failures"
