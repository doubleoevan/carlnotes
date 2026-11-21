// topic image render poll tests: a read per interval that pauses in a hidden tab and reads at once on the return, a
// settled render that stops the reads, and a render that never settles, which the poll's time limit settles as failed
import { afterEach, expect, jest, test } from "bun:test"
import type { TopicImageRenderResponse } from "@carlnotes/contracts/topicImages"
import { focusManager } from "@tanstack/react-query"
import { advancePolls, settle } from "../lib/pollTestFixtures"
import { startTopicImageRenderPoll, TOPIC_IMAGE_RENDER_POLL_MS } from "./useTopicImageRender"

// a pending render, and a succeeded one
const PENDING_RENDER = { status: "pending" } as TopicImageRenderResponse
const SUCCEEDED_RENDER = { status: "succeeded" } as TopicImageRenderResponse

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("the render poll pauses in a hidden tab, reads at once on the return, and stops once the render settles", async () => {
	// fake timers in a focused tab
	jest.useFakeTimers()
	focusManager.setFocused(true)

	// a poll that counts its reads and keeps each settled render
	let readCount = 0
	let render = PENDING_RENDER
	const settledRenders: (TopicImageRenderResponse | null)[] = []
	const stopPoll = startTopicImageRenderPoll({
		readRender: async () => {
			readCount += 1
			return render
		},
		onRenderSettled: (settledRender) => settledRenders.push(settledRender),
	})

	// one read per interval while the render is pending
	await advancePolls({ pollMs: TOPIC_IMAGE_RENDER_POLL_MS, pollCount: 2 })
	expect(readCount).toBe(2)

	// no read in a hidden tab, and a read at once on the return
	focusManager.setFocused(false)
	await advancePolls({ pollMs: TOPIC_IMAGE_RENDER_POLL_MS, pollCount: 4 })
	expect(readCount).toBe(2)
	focusManager.setFocused(true)
	await settle()
	expect(readCount).toBe(3)

	// a succeeded render settles once and stops the reads
	render = SUCCEEDED_RENDER
	await advancePolls({ pollMs: TOPIC_IMAGE_RENDER_POLL_MS, pollCount: 6 })
	expect(readCount).toBe(4)
	expect(settledRenders).toEqual([SUCCEEDED_RENDER])
	stopPoll()
})

test("a render that never settles is settled as failed at the poll's twenty-minute limit", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	const settledRenders: (TopicImageRenderResponse | null)[] = []
	const stopPoll = startTopicImageRenderPoll({
		readRender: async () => PENDING_RENDER,
		onRenderSettled: (settledRender) => settledRenders.push(settledRender),
	})

	// twenty minutes of pending reads settle nothing until the limit, which settles the render as failed
	await advancePolls({
		pollMs: TOPIC_IMAGE_RENDER_POLL_MS,
		pollCount: (20 * 60 * 1000) / TOPIC_IMAGE_RENDER_POLL_MS - 1,
	})
	expect(settledRenders).toEqual([])
	await advancePolls({ pollMs: TOPIC_IMAGE_RENDER_POLL_MS, pollCount: 2 })
	expect(settledRenders).toEqual([null])
	stopPoll()
})

test("a read in flight at the stop settles nothing", async () => {
	// fake timers in a focused tab, and a poll whose read settles only by hand
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let settleRead: (render: TopicImageRenderResponse) => void = () => {}
	const settledRenders: (TopicImageRenderResponse | null)[] = []
	const stopPoll = startTopicImageRenderPoll({
		readRender: () =>
			new Promise((resolve) => {
				settleRead = resolve
			}),
		onRenderSettled: (settledRender) => settledRenders.push(settledRender),
	})

	// the editor closes while the read is in flight, then the read returns a succeeded render
	await advancePolls({ pollMs: TOPIC_IMAGE_RENDER_POLL_MS, pollCount: 1 })
	stopPoll()
	settleRead(SUCCEEDED_RENDER)
	await settle()
	expect(settledRenders).toEqual([])
})
