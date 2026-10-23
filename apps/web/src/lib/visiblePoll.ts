// a poll that runs only while the page is visible, one request at a time

// the reload to run, the wait before the next reload given how long the poll has run, and whether a visible page
// reloads as soon as the poll starts
type StartVisiblePollOptions = {
	reload: () => Promise<void>
	toPollMs: (elapsedMs: number) => number
	isReloadingAtStart?: boolean
}

/**
 * Polls reload while the page is visible, one request at a time, and returns the call that stops the poll.
 */
export function startVisiblePoll({
	reload,
	toPollMs,
	isReloadingAtStart = false,
}: StartVisiblePollOptions): () => void {
	// when the poll started, the timer each tick sets for the next one, and the reload in flight
	const startedAt = Date.now()
	let pollTimer: ReturnType<typeof setTimeout> | undefined
	let inFlightReload: Promise<void> | null = null
	// the id of the poll in progress. a stop or a restart gives the next poll a new id, so a reload from an ended poll
	// schedules nothing when it settles
	let activePollId = 0

	// schedule the next tick at the rate for how long the poll has run
	function schedule(pollId: number): void {
		pollTimer = setTimeout(() => reloadThenSchedule(pollId), toPollMs(Date.now() - startedAt))
	}

	// reload, then schedule the next tick once the reload settles if the poll is still the one in progress. a reload
	// still in flight is waited for instead of sent again
	function reloadThenSchedule(pollId: number): void {
		inFlightReload ??= reload().finally(() => {
			inFlightReload = null
		})

		// schedule the next tick once the reload in flight settles
		void inFlightReload.finally(() => {
			if (pollId === activePollId) {
				schedule(pollId)
			}
		})
	}

	// end the poll in progress and clear its timer
	function stopPoll(): void {
		activePollId += 1
		clearTimeout(pollTimer)
	}

	// poll only while the page is visible. a page shown again reloads right away, then polls on
	function handleVisibilityChange(): void {
		stopPoll()
		if (document.visibilityState === "visible") {
			reloadThenSchedule(activePollId)
		}
	}

	// listen for the page's visibility, and start polling if the page is visible now
	document.addEventListener("visibilitychange", handleVisibilityChange)
	if (document.visibilityState === "visible") {
		if (isReloadingAtStart) {
			reloadThenSchedule(activePollId)
		} else {
			schedule(activePollId)
		}
	}

	// the stop ends the poll and stops listening
	return () => {
		stopPoll()
		document.removeEventListener("visibilitychange", handleVisibilityChange)
	}
}
