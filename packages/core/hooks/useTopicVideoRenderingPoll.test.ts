// film rendering poll tests: a status read per interval that the next read waits for, no read while the app is in the
// background, no read past the poll's four-hour time limit, a read of the page once the film leaves rendering, and a
// stop on a failed status read
import { afterEach, expect, jest, test } from "bun:test"
import { focusManager } from "@tanstack/react-query"
import { advancePolls, settle } from "../lib/pollTestFixtures"
import { startTopicVideoRenderingPoll, TOPIC_VIDEO_RENDERING_POLL_MS } from "./useTopicVideoRenderingPoll"

// the film's status a read returns while it renders
const RENDERING_STATUS = { status: "rendering" } as const

// a poll whose status read runs the given read and says rendering, and whose page read is counted
function startRenderingPoll(readStatus: () => void | Promise<void>): {
	pageReadCounts: { page: number }
	stopPoll: () => void
} {
	// the page read count, and the poll that raises it
	const pageReadCounts = { page: 0 }
	const stopPoll = startTopicVideoRenderingPoll({
		readStatus: async () => {
			await readStatus()
			return RENDERING_STATUS
		},
		readPageAgain: () => {
			pageReadCounts.page += 1
		},
	})
	return { pageReadCounts, stopPoll }
}

// the reads in four hours
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const FOUR_HOUR_READ_COUNT = FOUR_HOURS_MS / TOPIC_VIDEO_RENDERING_POLL_MS

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("the poll reads the page once per interval, pauses in the background, and reads at once on the return", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const { pageReadCounts, stopPoll } = startRenderingPoll(() => {
		readCount += 1
	})

	// one status read per interval, none at the start, and no page read while the film renders
	expect(readCount).toBe(0)
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 2 })
	expect(readCount).toBe(2)
	expect(pageReadCounts.page).toBe(0)

	// no read while the app is in the background
	focusManager.setFocused(false)
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 4 })
	expect(readCount).toBe(2)

	// the return reads at once, then on the interval again
	focusManager.setFocused(true)
	await settle()
	expect(readCount).toBe(3)

	// the stop ends the reads
	stopPoll()
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 2 })
	expect(readCount).toBe(3)
})

test("the poll waits for a read in flight, and a failed read does not stop the next one", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	let settleRead: () => void = () => {}
	const { stopPoll } = startRenderingPoll(() => {
		// the first read stays in flight until the test settles it
		readCount += 1
		if (readCount === 1) {
			return new Promise<void>((resolve) => {
				settleRead = resolve
			})
		}

		// the second read fails
		return Promise.reject(new Error("read failed"))
	})

	// no second read while the first is in flight
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 3 })
	expect(readCount).toBe(1)

	// the failed second read is followed by a third
	settleRead()
	await settle()
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 2 })
	expect(readCount).toBe(3)
	stopPoll()
})

test("the poll stops at four hours, so a film that never settles is not read forever", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const { stopPoll } = startRenderingPoll(() => {
		readCount += 1
	})

	// the poll still reads just before four hours
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: FOUR_HOUR_READ_COUNT - 1 })
	const readCountBeforeLimit = readCount
	expect(readCountBeforeLimit).toBeGreaterThan(FOUR_HOUR_READ_COUNT - 10)

	// no read past the limit
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 20 })
	const readCountAtLimit = readCount
	expect(readCountAtLimit).toBeLessThanOrEqual(FOUR_HOUR_READ_COUNT)

	// no read after a return from the background either
	focusManager.setFocused(false)
	focusManager.setFocused(true)
	await settle()
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 5 })
	expect(readCount).toBe(readCountAtLimit)
	stopPoll()
})

test("a film that leaves rendering reads the page, and a failed status read stops the poll", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const statusReads: ({ status: "rendering" | "ready" } | null)[] = [{ status: "rendering" }, { status: "ready" }, null]
	let statusReadCount = 0
	let pageReadCount = 0
	const stopPoll = startTopicVideoRenderingPoll({
		readStatus: async () => statusReads[statusReadCount++] ?? null,
		readPageAgain: () => {
			pageReadCount += 1
		},
	})

	// a rendering status reads nothing more, and a ready one reads the page once
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 1 })
	expect(pageReadCount).toBe(0)
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 1 })
	expect(pageReadCount).toBe(1)

	// the failed status read stops the poll
	await advancePolls({ pollMs: TOPIC_VIDEO_RENDERING_POLL_MS, pollCount: 5 })
	expect(statusReadCount).toBe(3)
	expect(pageReadCount).toBe(1)
	stopPoll()
})
