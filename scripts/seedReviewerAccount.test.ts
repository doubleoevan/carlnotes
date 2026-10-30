// the reviewer seed's pure parts: the flag parser, the environment check, the fixtures, and the scan wait rule
import { expect, test } from "bun:test"
import {
	parseReviewerSeedArguments,
	toReviewerEnvironment,
	toReviewerFixtures,
	toScanWaitStatus,
} from "./seedReviewerAccount"

test("the parser reads both flag spellings and skips the bare -- that bun run passes through", () => {
	expect(parseReviewerSeedArguments(["--", "--environment", "dev"])).toEqual({ requestedEnvironment: "dev" })
	expect(parseReviewerSeedArguments(["--environment=prd"])).toEqual({ requestedEnvironment: "prd" })
	expect(parseReviewerSeedArguments([])).toEqual({ requestedEnvironment: undefined })
	expect(parseReviewerSeedArguments(["--environment"])).toEqual({ requestedEnvironment: undefined })
})

test("the environment check rejects a missing flag, an unknown environment, and a Doppler config mismatch", () => {
	expect(() => toReviewerEnvironment({ requestedEnvironment: undefined, dopplerConfig: "dev" })).toThrow(
		"--environment is missing",
	)
	expect(() => toReviewerEnvironment({ requestedEnvironment: "staging", dopplerConfig: "staging" })).toThrow(
		'must be dev or prd, not "staging"',
	)
	expect(() => toReviewerEnvironment({ requestedEnvironment: "prd", dopplerConfig: "dev" })).toThrow(
		'--environment is "prd" but DOPPLER_CONFIG is "dev"',
	)
	expect(() => toReviewerEnvironment({ requestedEnvironment: "dev", dopplerConfig: undefined })).toThrow(
		'DOPPLER_CONFIG is "unset"',
	)
})

test("the environment check returns the environment when the flag and the Doppler config agree", () => {
	expect(toReviewerEnvironment({ requestedEnvironment: "dev", dopplerConfig: "dev" })).toBe("dev")
	expect(toReviewerEnvironment({ requestedEnvironment: "prd", dopplerConfig: "prd" })).toBe("prd")
})

test("the fixtures name the topic, the note, the team, and the feed url they were built with", () => {
	const fixtures = toReviewerFixtures("https://carlnotes.com/feed.xml")
	expect(fixtures.topic.name).toBe("Carl's own notes")
	expect(fixtures.topic.feedUrl).toBe("https://carlnotes.com/feed.xml")
	expect(fixtures.team.name).toBe("Review crew")
	// the chat message names nobody, so posting it starts no chat turn
	expect(fixtures.chatMessage).not.toContain("@")
})

test("the scan wait is ready only once a succeeded scan has findings and a recap", () => {
	const succeededReading = { status: "succeeded", error: null, scanSummary: "a recap", findingCount: 3 }
	// no row, still running, or short of findings or a recap keeps waiting
	expect(toScanWaitStatus(undefined)).toBe("waiting")
	expect(toScanWaitStatus({ ...succeededReading, status: "running" })).toBe("waiting")
	expect(toScanWaitStatus({ ...succeededReading, findingCount: 0 })).toBe("waiting")
	expect(toScanWaitStatus({ ...succeededReading, scanSummary: null })).toBe("waiting")
	// done, or failed
	expect(toScanWaitStatus(succeededReading)).toBe("ready")
	expect(toScanWaitStatus({ ...succeededReading, status: "failed", error: "no sources" })).toBe("failed")
})
