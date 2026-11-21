// Topic Post discussion poll tests: a status read per interval, no read while the app is in the background, no read
// past the poll's time limit, a read of the post once the discussion leaves recording, and a stop on a failed status
import { afterEach, expect, jest, test } from "bun:test"
import { focusManager } from "@tanstack/react-query"
import { advancePolls, settle } from "../lib/pollTestFixtures"
import { TOPIC_POST_DISCUSSION_POLL_MS } from "../lib/topicPostDiscussions"
import { startTopicPostDiscussionPoll } from "./useTopicPostDiscussion"

// a poll whose status read counts each read and says recording, and whose post read counts each read
function startCountedPoll(): { readCounts: { status: number; post: number }; stopPoll: () => void } {
	const readCounts = { status: 0, post: 0 }
	const stopPoll = startTopicPostDiscussionPoll({
		readDiscussionStatus: async () => {
			readCounts.status += 1
			return { status: "recording" }
		},
		readTopicPostAgain: () => {
			readCounts.post += 1
		},
	})
	return { readCounts, stopPoll }
}

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("the poll reads the status once per interval, pauses in the background, and reads at once on the return", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const { readCounts, stopPoll } = startCountedPoll()

	// one status read per interval, none at the start, and no post read while the discussion records
	expect(readCounts.status).toBe(0)
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 2 })
	expect(readCounts).toEqual({ status: 2, post: 0 })

	// no read while the app is in the background
	focusManager.setFocused(false)
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 4 })
	expect(readCounts.status).toBe(2)

	// the return reads at once, then on the interval again
	focusManager.setFocused(true)
	await settle()
	expect(readCounts.status).toBe(3)
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 1 })
	expect(readCounts.status).toBe(4)

	// the stop ends the reads
	stopPoll()
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 2 })
	expect(readCounts).toEqual({ status: 4, post: 0 })
})

test("a discussion that leaves recording reads the post, and a failed status read stops the poll", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const statusReads: ({ status: "recording" | "published" } | null)[] = [
		{ status: "recording" },
		{ status: "published" },
		null,
	]
	let postReadCount = 0
	let statusReadCount = 0
	const stopPoll = startTopicPostDiscussionPoll({
		readDiscussionStatus: async () => statusReads[statusReadCount++] ?? null,
		readTopicPostAgain: () => {
			postReadCount += 1
		},
	})

	// a recording status reads nothing more, and a published one reads the post once
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 1 })
	expect(postReadCount).toBe(0)
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 1 })
	expect(postReadCount).toBe(1)

	// the failed status read stops the poll
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 5 })
	expect(statusReadCount).toBe(3)
	expect(postReadCount).toBe(1)
	stopPoll()
})

test("the poll stops at its time limit, so a recording that never settles is not read forever", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const { readCounts, stopPoll } = startCountedPoll()

	// forty-five minutes of reads, fifteen seconds apart
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 180 })
	const readCountAtLimit = readCounts.status
	expect(readCountAtLimit).toBeGreaterThan(170)

	// no read past the limit, and none after a return from the background
	await advancePolls({ pollMs: TOPIC_POST_DISCUSSION_POLL_MS, pollCount: 20 })
	focusManager.setFocused(false)
	focusManager.setFocused(true)
	await settle()
	expect(readCounts.status).toBe(readCountAtLimit)
	stopPoll()
})
