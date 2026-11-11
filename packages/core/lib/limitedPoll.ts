// a poll with a time limit, on activePoll: a read on an interval while the app is focused and online, until the limit
import { startActivePoll } from "./activePoll"
import { isFocusedAndOnline, subscribeToFocusAndOnline } from "./focusAndOnline"

// the read, which the next read waits for, the wait between reads, and how long the poll reads before it stops
type StartLimitedPollOptions = {
	read: () => void | Promise<void>
	pollMs: number
	limitMs: number
}

/**
 * Reads on an interval while the app is focused and online, until the poll's time limit, and returns the call that
 * stops the reads.
 */
export function startLimitedPoll({ read, pollMs, limitMs }: StartLimitedPollOptions): () => void {
	// the reads, paused while the app is in the background or offline
	const stopPoll = startActivePoll({
		reload: async () => {
			await read()
		},
		toPollMs: () => pollMs,
		isActive: isFocusedAndOnline,
		subscribe: subscribeToFocusAndOnline,
	})

	// the reads end at the time limit, and at the stop
	const limitTimer = setTimeout(stopPoll, limitMs)
	return () => {
		clearTimeout(limitTimer)
		stopPoll()
	}
}
