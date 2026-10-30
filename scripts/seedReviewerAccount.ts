// the pure parts of `bun run reviewer:seed`: the argument parser, the environment check, the fixtures the reviewer's
// account gets, and the scan wait rule. seed-reviewer-account.ts holds the database and api calls

import { parseArgs } from "node:util"

// the environments the reviewer's account can be seeded in, each the name of a Doppler config
export const REVIEWER_ENVIRONMENTS = ["dev", "prd"] as const

export type ReviewerEnvironment = (typeof REVIEWER_ENVIRONMENTS)[number]

// how long the scan wait polls, and how often
export const SCAN_WAIT_MS = 10 * 60 * 1000
export const SCAN_POLL_MS = 5000

// the environment the flag asked for and the Doppler config the process runs under
type ToReviewerEnvironmentOptions = { requestedEnvironment: string | undefined; dopplerConfig: string | undefined }

// what the scan wait reads each poll: the latest scan's status and recap, and the topic's finding count
export type ScanWaitReading = {
	status: string
	error: string | null
	scanSummary: string | null
	findingCount: number
}

/**
 * Returns the requested environment, undefined without the flag, as { requestedEnvironment }. The flag is
 * `--environment <name>` or `--environment=<name>`, and a bare `--` that bun run passes through is skipped.
 */
export function parseReviewerSeedArguments(scriptArguments: string[]): { requestedEnvironment: string | undefined } {
	// the bare -- would end option parsing, so it is dropped first. a flag with no value parses as true, not a name
	const { values } = parseArgs({
		args: scriptArguments.filter((scriptArgument) => scriptArgument !== "--"),
		options: { environment: { type: "string" } },
		allowPositionals: true,
		strict: false,
	})
	return { requestedEnvironment: typeof values.environment === "string" ? values.environment : undefined }
}

/**
 * Returns the environment to seed, or throws if the flag is missing, names an unknown environment, or differs from
 * the Doppler config the process runs under.
 */
export function toReviewerEnvironment({
	requestedEnvironment,
	dopplerConfig,
}: ToReviewerEnvironmentOptions): ReviewerEnvironment {
	// require the flag
	if (!requestedEnvironment) {
		throw new Error(
			"reviewer:seed will not run: --environment is missing. pass --environment dev or --environment prd, the same config the process runs under",
		)
	}
	if (!isReviewerEnvironment(requestedEnvironment)) {
		throw new Error(`reviewer:seed will not run: --environment must be dev or prd, not "${requestedEnvironment}"`)
	}

	// the flag and the Doppler config name the same environment
	if (dopplerConfig !== requestedEnvironment) {
		const dopplerConfigName = dopplerConfig ?? "unset"
		throw new Error(
			`reviewer:seed will not run: --environment is "${requestedEnvironment}" but DOPPLER_CONFIG is "${dopplerConfigName}"`,
		)
	}
	return requestedEnvironment
}

// the fixtures the reviewer's account holds: the display name, the Topic and its feed, the Tasting Note, the Team,
// and the first chat message
export type ReviewerFixtures = {
	displayName: string
	topic: { name: string; prompt: string; feedUrl: string }
	note: { name: string; html: string }
	team: { name: string }
	chatMessage: string
}

/**
 * Returns the fixtures the reviewer's account holds, with the Topic's Source at the environment's own blog feed.
 */
export function toReviewerFixtures(feedUrl: string): ReviewerFixtures {
	return {
		// the account's display name
		displayName: "Store reviewer",
		// the Topic that reads the site's own blog feed
		topic: {
			name: "Carl's own notes",
			prompt:
				"What CarlNotes shipped and wrote about lately. Keep the posts that explain a feature a reader can try today, and pass on anything that only announces.",
			feedUrl,
		},
		// the Tasting Note on that Topic
		note: {
			name: "First pour",
			html: "<p>A quick note from Carl. This topic reads my own blog, so every finding here is something you can try in the app. Start with the newest one.</p>",
		},
		// the Team the reviewer leads, and the first message in its chat room
		team: { name: "Review crew" },
		chatMessage: "Welcome to the review crew. Carl keeps the notes, we keep him honest.",
	}
}

/**
 * Returns "ready" once the latest scan succeeded with a recap and the Topic has Findings, "failed" if the scan failed,
 * and "waiting" otherwise.
 */
export function toScanWaitStatus(reading: ScanWaitReading | undefined): "ready" | "failed" | "waiting" {
	// no scan row yet, or one still running, keeps waiting
	if (!reading) {
		return "waiting"
	}
	if (reading.status === "failed") {
		return "failed"
	}

	// a succeeded scan is ready once it left findings and a recap behind
	const hasFindingsAndRecap = reading.findingCount > 0 && Boolean(reading.scanSummary)
	return reading.status === "succeeded" && hasFindingsAndRecap ? "ready" : "waiting"
}

// whether a string names one of the reviewer environments
function isReviewerEnvironment(value: string): value is ReviewerEnvironment {
	return (REVIEWER_ENVIRONMENTS as readonly string[]).includes(value)
}
