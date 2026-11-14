// the runners that limit how many tasks run at once, by their count or by the weight each one takes

/**
 * Runs one task per item with at most `maxConcurrency` tasks running and returns the results in item order.
 */
export async function runWithConcurrency<Item, Result>(
	items: Item[],
	maxConcurrency: number,
	runFunction: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
	// one shared cursor hands the next index to whichever worker is free, so slots refill as work finishes
	const results: Result[] = new Array(items.length)
	let nextIndex = 0
	async function runWorker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++
			// the cursor already moved, so this index is this worker's alone
			const item = items[index] as Item
			results[index] = await runFunction(item, index)
		}
	}

	// never start more workers than there is work, and never fewer than one
	const workerCount = Math.max(1, Math.min(maxConcurrency, items.length))
	await Promise.all(Array.from({ length: workerCount }, runWorker))
	return results
}

/**
 * Returns a runner that lets at most `maxConcurrency` of its tasks run at once across every caller in the process. A
 * task past the limit waits for a running one to finish.
 */
export function createConcurrencyLimiter(
	maxConcurrency: number,
): <Result>(runFunction: () => Promise<Result>) => Promise<Result> {
	// each task takes a slot, a weight of one, and waits for one if every slot is taken
	const takeSlot = createWeightLimiter(maxConcurrency)
	return async (runFunction) => {
		const releaseSlot = await takeSlot(1)

		// the slot passes on once the task ends, failed or not
		try {
			return await runFunction()
		} finally {
			releaseSlot()
		}
	}
}

/**
 * Returns a function that takes a weight once the weights taken across every caller in the process leave room for it
 * within `maxWeight`, and resolves with the function that releases it. A weight with no room waits its turn, oldest
 * first, and a weight above `maxWeight` is taken alone. A take given a signal leaves the wait and rejects with the
 * signal's reason if the signal aborts before its turn comes.
 */
export function createWeightLimiter(maxWeight: number): (weight: number, signal?: AbortSignal) => Promise<() => void> {
	// the weight taken now, and the takes waiting for room, oldest first
	let takenWeight = 0
	const waitingTakes: { weight: number; take: () => void }[] = []

	// whether a weight fits beside the weight taken. a weight above the limit fits once nothing else is taken
	const isRoomFor = (weight: number): boolean => takenWeight === 0 || takenWeight + weight <= maxWeight

	// start the waiting takes in order for as long as the oldest one fits, so no take passes an older one
	const startWaitingTakes = (): void => {
		while (waitingTakes[0] && isRoomFor(waitingTakes[0].weight)) {
			waitingTakes.shift()?.take()
		}
	}

	return (weight, signal) =>
		new Promise((resolve, reject) => {
			// a take whose signal has already aborted never waits
			if (signal?.aborted) {
				reject(signal.reason)
				return
			}

			// a release counts once, however many times it is called
			let isReleased = false
			const release = (): void => {
				if (isReleased) {
					return
				}
				isReleased = true

				// return the weight, and start the takes waiting for it
				takenWeight -= weight
				startWaitingTakes()
			}

			// take the weight and resolve with its release
			const waitingTake = {
				weight,
				take: (): void => {
					signal?.removeEventListener("abort", leaveWait)
					takenWeight += weight
					resolve(release)
				},
			}

			// leave the wait if the signal aborts first, and start the takes that waited behind this one
			function leaveWait(): void {
				const waitingIndex = waitingTakes.indexOf(waitingTake)
				if (waitingIndex >= 0) {
					waitingTakes.splice(waitingIndex, 1)
				}
				reject(signal?.reason)
				startWaitingTakes()
			}

			// a take waits behind every older one, and for room
			if (waitingTakes.length > 0 || !isRoomFor(weight)) {
				waitingTakes.push(waitingTake)
				signal?.addEventListener("abort", leaveWait, { once: true })
				return
			}
			waitingTake.take()
		})
}

/**
 * Returns a function that takes a key's turn: it resolves, with the function that ends the turn, once every earlier
 * turn of that key has ended, so the work of one key runs one at a time. A take whose signal aborts before its turn
 * comes gives the turn up and rejects with the signal's reason.
 */
export function createTurnTaker(): (turnKey: string, signal: AbortSignal) => Promise<() => void> {
	// the end of each key's latest turn, forgotten once that turn ends with none behind it
	const latestTurnEnds = new Map<string, Promise<void>>()
	return async (turnKey, signal) => {
		// this turn ends after the key's earlier turns and its own end
		const earlierTurnsEnd = latestTurnEnds.get(turnKey) ?? Promise.resolve()
		const turn = Promise.withResolvers<void>()
		const turnEnd = earlierTurnsEnd.then(() => turn.promise)
		latestTurnEnds.set(turnKey, turnEnd)

		// forget the key once this turn has ended with no later turn behind it
		void turnEnd.then(() => {
			if (latestTurnEnds.get(turnKey) === turnEnd) {
				latestTurnEnds.delete(turnKey)
			}
		})

		// wait for the earlier turns, and give this turn up if the signal aborts first
		const abort = Promise.withResolvers<never>()
		const rejectOnAbort = (): void => abort.reject(signal.reason)
		signal.addEventListener("abort", rejectOnAbort, { once: true })
		try {
			// a signal that has already aborted takes no turn
			if (signal.aborted) {
				throw signal.reason
			}
			await Promise.race([earlierTurnsEnd, abort.promise])
		} catch (error) {
			// a turn given up ends at once, so the key's later turns wait for the earlier ones alone
			turn.resolve()
			throw error
		} finally {
			signal.removeEventListener("abort", rejectOnAbort)
		}

		// the turn is taken, and its taker ends it
		return turn.resolve
	}
}
