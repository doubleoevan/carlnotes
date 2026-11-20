// the stage timeouts: the longest an activity runs across its attempts, and the longest a recording runs, which the
// reaper's limit is derived from
import { expect, test } from "bun:test"
import { MAX_PODCAST_EPISODE_RECORDING_MS, toLongestActivityRunMs } from "./stageTimeouts"

test("an activity's longest run is every attempt at its timeout with the waits between them", () => {
	// three attempts of two minutes, with Temporal's default waits of one and two seconds
	expect(toLongestActivityRunMs(120_000, { maximumAttempts: 3 })).toBe(363_000)

	// five attempts of four minutes that back off from 30 seconds: 30, 60, 120, and 240 seconds
	expect(toLongestActivityRunMs(240_000, { maximumAttempts: 5, initialInterval: 30_000 })).toBe(1_650_000)

	// a policy's longest wait limits every wait, and one attempt waits for nothing
	const limitedWaitRetryPolicy = { maximumAttempts: 4, initialInterval: 1000, maximumInterval: 1500 }
	expect(toLongestActivityRunMs(1000, limitedWaitRetryPolicy)).toBe(8000)
	expect(toLongestActivityRunMs(60_000, { maximumAttempts: 1 })).toBe(60_000)
})

// the plan, an hour for the outline, an hour for the segments, the saved script, six hours of flex chapters, the
// encode, a failed publish, and the failure write: 8 hours 54 minutes and 15 seconds
test("a recording's longest run is the sum of its activities' longest runs", () => {
	expect(MAX_PODCAST_EPISODE_RECORDING_MS).toBe(32_055_000)
})
