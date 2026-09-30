// the runner that bounds how many tasks are in flight at once

/**
 * Runs one task per item with at most `maxConcurrency` tasks in flight and returns the results in item order.
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
