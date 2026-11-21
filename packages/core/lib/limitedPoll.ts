// a poll with a time limit, on activePoll: a read on an interval while the app is focused and online, until the limit
import { startActivePoll } from "./activePoll"
import { isFocusedAndOnline, subscribeToFocusAndOnline } from "./focusAndOnline"

// the read, which the next read waits for and which reads whether the poll has stopped, the wait between reads, how
// long the poll reads before it stops, and what the poll does once it reaches that limit
type StartLimitedPollOptions = {
	read: (isStopped: () => boolean) => void | Promise<void>
	pollMs: number
	limitMs: number
	onLimitReached?: () => void
}

/**
 * Reads on an interval while the app is focused and online, until the poll's time limit, and returns the call that
 * stops the reads. A read in flight reads whether the poll stopped at the stop or at the limit.
 */
export function startLimitedPoll({ read, pollMs, limitMs, onLimitReached }: StartLimitedPollOptions): () => void {
	// the reads, paused while the app is in the background or offline
	let isStopped = false
	const stopPoll = startActivePoll({
		reload: async () => {
			await read(() => isStopped)
		},
		toPollMs: () => pollMs,
		isActive: isFocusedAndOnline,
		subscribe: subscribeToFocusAndOnline,
	})

	// end the reads at the time limit and run onLimitReached
	const limitTimer = setTimeout(() => {
		isStopped = true
		stopPoll()
		onLimitReached?.()
	}, limitMs)

	// the stop ends the reads before the limit
	return () => {
		isStopped = true
		clearTimeout(limitTimer)
		stopPoll()
	}
}
