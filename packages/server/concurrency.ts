// the runner that bounds how many tasks run at once

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
	// the tasks running now, and the starts of the tasks waiting, oldest first
	let runningCount = 0
	const waitingStarts: (() => void)[] = []

	// a finished task starts the oldest waiting one in its place
	const finish = (): void => {
		const nextStart = waitingStarts.shift()
		if (nextStart) {
			nextStart()
			return
		}
		runningCount--
	}

	// each task runs in a slot
	return async (runFunction) => {
		// a task past the limit waits for a slot, which a finished task passes to it
		if (runningCount >= maxConcurrency) {
			await new Promise<void>((resolve) => waitingStarts.push(resolve))
		} else {
			runningCount++
		}

		// the slot passes on once the task ends, failed or not
		try {
			return await runFunction()
		} finally {
			finish()
		}
	}
}
