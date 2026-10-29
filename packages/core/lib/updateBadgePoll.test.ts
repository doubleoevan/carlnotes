// update badge poll tests: no request while inactive, one read per tick, a reload only when the count changes, and a
// dropped response after the account changes or the poll stops
import { expect, jest, test } from "bun:test"
import { startUpdateBadgePoll } from "./updateBadgePoll"

// a poll under test: the reads each source took, what each read fed, the stop, and the controls
type TestPoll = {
	readCounts: { chatMentionCount: number; topicInviteBadges: number }
	firedCallbacks: string[]
	stop: () => void
	setChatMentionCount: (count: number) => void
	publishFocusChange: () => void
}

// a poll over fake timers with every control in the test's hands
function startTestPoll(settings: { isActive?: () => boolean; isCurrentAccount?: () => boolean } = {}): TestPoll {
	// the focus listeners, the reads each source took, what each read fed, and the count the next read returns
	const listeners = new Set<() => void>()
	const readCounts = { chatMentionCount: 0, topicInviteBadges: 0 }
	const firedCallbacks: string[] = []
	let chatMentionCount = 0

	// start the poll on a one-second tick
	const stop = startUpdateBadgePoll({
		isActive: settings.isActive ?? (() => true),
		isCurrentAccount: settings.isCurrentAccount ?? (() => true),
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		fetchChatMentionCount: async () => {
			readCounts.chatMentionCount += 1
			return chatMentionCount
		},
		fetchTopicInviteBadges: async () => {
			readCounts.topicInviteBadges += 1
			return []
		},
		onChatMentionCountChange: () => firedCallbacks.push("rooms"),
		onTopicInviteBadges: () => firedCallbacks.push("invites"),
		pollMs: 1_000,
	})

	// the controls: the next count, and a focus change
	return {
		readCounts,
		firedCallbacks,
		stop,
		setChatMentionCount: (count: number) => {
			chatMentionCount = count
		},
		publishFocusChange: () => {
			// a focus change reaches the poll
			for (const listener of listeners) {
				listener()
			}
		},
	}
}

// let the awaited reads settle
async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve()
	}
}

// an active poll reads both sources at once, then once per tick, and reloads the rooms only when the count changes
test("an active poll reads each source once per tick and reloads rooms on a changed count", async () => {
	jest.useFakeTimers()
	try {
		// the first reads report both sources
		const poll = startTestPoll()
		await settle()
		expect(poll.readCounts).toEqual({ chatMentionCount: 1, topicInviteBadges: 1 })
		expect(poll.firedCallbacks).toEqual(["rooms", "invites"])

		// an unchanged count reloads no rooms on the next tick
		jest.advanceTimersByTime(1_000)
		await settle()
		expect(poll.readCounts).toEqual({ chatMentionCount: 2, topicInviteBadges: 2 })
		expect(poll.firedCallbacks.filter((event) => event === "rooms")).toHaveLength(1)

		// a changed count reloads them
		poll.setChatMentionCount(2)
		jest.advanceTimersByTime(1_000)
		await settle()
		expect(poll.firedCallbacks.filter((event) => event === "rooms")).toHaveLength(2)
		poll.stop()
	} finally {
		// put the real clock back
		jest.useRealTimers()
	}
})

// an inactive poll sends nothing, and reads at once when the app becomes active
test("an inactive poll sends nothing until the app is active", async () => {
	jest.useFakeTimers()
	try {
		// five seconds inactive send nothing
		let isActive = false
		const poll = startTestPoll({ isActive: () => isActive })
		jest.advanceTimersByTime(5_000)
		await settle()
		expect(poll.readCounts).toEqual({ chatMentionCount: 0, topicInviteBadges: 0 })

		// becoming active reads at once
		isActive = true
		poll.publishFocusChange()
		await settle()
		expect(poll.readCounts).toEqual({ chatMentionCount: 1, topicInviteBadges: 1 })
		poll.stop()
	} finally {
		// put the real clock back
		jest.useRealTimers()
	}
})

// a response that arrives after the account changed or the poll stopped feeds nothing
test("a response from a replaced account or a stopped poll is dropped", async () => {
	jest.useFakeTimers()
	try {
		// the account is replaced while the first reads are in progress
		let isCurrentAccount = true
		const replacedPoll = startTestPoll({ isCurrentAccount: () => isCurrentAccount })
		isCurrentAccount = false
		await settle()
		expect(replacedPoll.readCounts.chatMentionCount).toBe(1)
		expect(replacedPoll.firedCallbacks).toEqual([])
		replacedPoll.stop()

		// the poll stops while the first reads are in progress
		const stoppedPoll = startTestPoll()
		stoppedPoll.stop()
		await settle()
		expect(stoppedPoll.readCounts.chatMentionCount).toBe(1)
		expect(stoppedPoll.firedCallbacks).toEqual([])
	} finally {
		// put the real clock back
		jest.useRealTimers()
	}
})
