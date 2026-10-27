// a poll that runs only while the screen is active, one request at a time

// the reload to run, the wait before the next reload given how long the poll has run, and whether an active screen
// reloads as soon as the poll starts
export type StartActivePollOptions = {
	isActive: () => boolean
	subscribe: (listener: () => void) => () => void
	reload: () => Promise<void>
	toPollMs: (elapsedMs: number) => number
	isReloadingAtStart?: boolean
}

/**
 * Polls reload while the screen is active, one request at a time, and returns the call that stops the poll.
 */
export function startActivePoll({
	reload,
	toPollMs,
	isActive,
	subscribe,
	isReloadingAtStart = false,
}: StartActivePollOptions): () => void {
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
		inFlightReload ??= reload()
			.catch(() => {})
			.finally(() => {
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

	// poll only while the screen is active. a screen activated again reloads right away, then polls on
	function handleActivityChange(): void {
		stopPoll()
		if (isActive()) {
			reloadThenSchedule(activePollId)
		}
	}

	// listen for the screen's activity, and start polling if the screen is active now
	const unsubscribe = subscribe(handleActivityChange)
	if (isActive()) {
		if (isReloadingAtStart) {
			reloadThenSchedule(activePollId)
		} else {
			schedule(activePollId)
		}
	}

	// the stop ends the poll and stops listening
	return () => {
		stopPoll()
		unsubscribe()
	}
}
