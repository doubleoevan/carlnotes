// the counts poll behind a page's viewer, follower, or listener counts: a read once the page shows, then every minute
// while the app is focused and online, on activePoll. a failed read keeps the counts already shown
import { startActivePoll } from "./activePoll"
import { isFocusedAndOnline, subscribeToFocusAndOnline } from "./focusAndOnline"

export const COUNTS_POLL_MS = 60_000

export type StartCountsPollOptions<Counts> = {
	// the read, with the signal the stop aborts, and what each read that returns counts feeds
	readCounts: (signal: AbortSignal) => Promise<Counts | null>
	onCounts: (counts: Counts) => void
	// the wait between reads, a minute outside a test
	pollMs?: number
}

/**
 * Polls a page's counts while the app is focused and online, and returns the stop, which also aborts the read in
 * progress and drops its result.
 */
export function startCountsPoll<Counts>({
	readCounts,
	onCounts,
	pollMs = COUNTS_POLL_MS,
}: StartCountsPollOptions<Counts>): () => void {
	// the stop aborts the read in progress, and a read that settles after it feeds nothing
	const abortController = new AbortController()
	const reload = async (): Promise<void> => {
		const counts = await readCounts(abortController.signal)
		if (counts && !abortController.signal.aborted) {
			onCounts(counts)
		}
	}
	const stopPoll = startActivePoll({
		reload,
		toPollMs: () => pollMs,
		isActive: isFocusedAndOnline,
		subscribe: subscribeToFocusAndOnline,
		isReloadingAtStart: true,
	})
	return () => {
		abortController.abort()
		stopPoll()
	}
}
