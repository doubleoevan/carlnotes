import { createWeightLimiter } from "@carlnotes/server/concurrency"

// New films, selected upgrades and poster rebuilds compete for the same worker CPU and scratch disk.
const takeFilmSlot = createWeightLimiter(1)

/** Holds the slot through cleanup and stops the attempt before Temporal's four-hour deadline. */
export async function withTopicVideoSlot<T>(
	signal: AbortSignal | undefined,
	render: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const deadline = AbortSignal.timeout(3.8 * 3600_000)
	const activeSignal = signal ? AbortSignal.any([deadline, signal]) : deadline
	const release = await takeFilmSlot(1, activeSignal)
	try {
		return await render(activeSignal)
	} finally {
		release()
	}
}
