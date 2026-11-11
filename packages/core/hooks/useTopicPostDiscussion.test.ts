// Topic Post discussion poll tests: a read per interval, no read while the app is in the background, and no read past
// the poll's time limit
import { afterEach, expect, jest, test } from "bun:test"
import { focusManager } from "@tanstack/react-query"
import { TOPIC_POST_DISCUSSION_POLL_MS } from "../lib/topicPostDiscussions"
import { startTopicPostDiscussionPoll } from "./useTopicPostDiscussion"

// let the awaited reads settle
async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve()
	}
}

// advance the clock one poll interval at a time, so each read settles before the next
async function advancePolls(pollCount: number): Promise<void> {
	for (let i = 0; i < pollCount; i++) {
		jest.advanceTimersByTime(TOPIC_POST_DISCUSSION_POLL_MS)
		await settle()
	}
}

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("the poll reads the post once per interval, pauses in the background, and reads at once on the return", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const stopPoll = startTopicPostDiscussionPoll(() => {
		readCount += 1
	})

	// one read per interval, and none at the start
	expect(readCount).toBe(0)
	await advancePolls(2)
	expect(readCount).toBe(2)

	// no read while the app is in the background
	focusManager.setFocused(false)
	await advancePolls(4)
	expect(readCount).toBe(2)

	// the return reads at once, then on the interval again
	focusManager.setFocused(true)
	await settle()
	expect(readCount).toBe(3)
	await advancePolls(1)
	expect(readCount).toBe(4)

	// the stop ends the reads
	stopPoll()
	await advancePolls(2)
	expect(readCount).toBe(4)
})

test("the poll stops at its time limit, so a recording that never settles is not read forever", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const stopPoll = startTopicPostDiscussionPoll(() => {
		readCount += 1
	})

	// forty-five minutes of reads, fifteen seconds apart
	await advancePolls(180)
	const readCountAtLimit = readCount
	expect(readCountAtLimit).toBeGreaterThan(170)

	// no read past the limit, and none after a return from the background
	await advancePolls(20)
	focusManager.setFocused(false)
	focusManager.setFocused(true)
	await settle()
	expect(readCount).toBe(readCountAtLimit)
	stopPoll()
})
