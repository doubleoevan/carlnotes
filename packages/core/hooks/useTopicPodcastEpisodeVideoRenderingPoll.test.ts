// film rendering poll tests: a read per interval that the next read waits for, no read while the app is in the
// background, and no read past the poll's four-hour time limit
import { afterEach, expect, jest, test } from "bun:test"
import { focusManager } from "@tanstack/react-query"
import {
	startTopicPodcastEpisodeVideoRenderingPoll,
	TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_MS,
} from "./useTopicPodcastEpisodeVideoRenderingPoll"

// the reads in four hours
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const FOUR_HOUR_READ_COUNT = FOUR_HOURS_MS / TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_MS

// let the awaited reads settle
async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve()
	}
}

// advance the clock one poll interval at a time, so each read settles before the next
async function advancePolls(pollCount: number): Promise<void> {
	for (let i = 0; i < pollCount; i++) {
		jest.advanceTimersByTime(TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_POLL_MS)
		await settle()
	}
}

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("the poll reads the page once per interval, pauses in the background, and reads at once on the return", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const stopPoll = startTopicPodcastEpisodeVideoRenderingPoll(() => {
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

	// the stop ends the reads
	stopPoll()
	await advancePolls(2)
	expect(readCount).toBe(3)
})

test("the poll waits for a read in flight, and a failed read does not stop the next one", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	let settleRead: () => void = () => {}
	const stopPoll = startTopicPodcastEpisodeVideoRenderingPoll(() => {
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
	await advancePolls(3)
	expect(readCount).toBe(1)

	// the failed second read is followed by a third
	settleRead()
	await settle()
	await advancePolls(2)
	expect(readCount).toBe(3)
	stopPoll()
})

test("the poll stops at four hours, so a film that never settles is not read forever", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const stopPoll = startTopicPodcastEpisodeVideoRenderingPoll(() => {
		readCount += 1
	})

	// the poll still reads just before four hours
	await advancePolls(FOUR_HOUR_READ_COUNT - 1)
	const readCountBeforeLimit = readCount
	expect(readCountBeforeLimit).toBeGreaterThan(FOUR_HOUR_READ_COUNT - 10)

	// no read past the limit
	await advancePolls(20)
	const readCountAtLimit = readCount
	expect(readCountAtLimit).toBeLessThanOrEqual(FOUR_HOUR_READ_COUNT)

	// no read after a return from the background either
	focusManager.setFocused(false)
	focusManager.setFocused(true)
	await settle()
	await advancePolls(5)
	expect(readCount).toBe(readCountAtLimit)
	stopPoll()
})
