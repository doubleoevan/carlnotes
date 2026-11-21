// counts poll tests: a read at the start and one per tick, a poll from saved counts that reads a tick later, a failed
// read that feeds nothing, and a stop that aborts the read in progress and drops its result
import { expect, jest, test } from "bun:test"
import { startCountsPoll } from "./countsPoll"
import { advancePolls, settle } from "./pollTestFixtures"

// the poll reads at once and then every tick, and a read that returns null leaves the last counts in place
test("the poll reads at the start and once per tick, and a failed read feeds nothing", async () => {
	jest.useFakeTimers()
	try {
		// the reads taken and the counts fed, with the second read failing
		let readCount = 0
		const fedCounts: number[] = []
		const stop = startCountsPoll({
			readCounts: async () => {
				readCount += 1
				return readCount === 2 ? null : { viewerCount: readCount }
			},
			onCounts: (counts) => fedCounts.push(counts.viewerCount),
			pollMs: 1_000,
		})
		await settle()
		expect(fedCounts).toEqual([1])

		// the failed second read feeds nothing, and the third read feeds again
		await advancePolls({ pollMs: 1_000, pollCount: 1 })
		expect(fedCounts).toEqual([1])
		await advancePolls({ pollMs: 1_000, pollCount: 1 })
		expect(fedCounts).toEqual([1, 3])
		stop()
	} finally {
		// put the real clock back
		jest.useRealTimers()
	}
})

// the stop aborts the signal the read holds, and the read's late result feeds nothing
test("the stop aborts the read in progress and drops its result", async () => {
	// a read that resolves only after the test lets it
	let receivedSignal: AbortSignal | undefined
	let resolveRead: (counts: { viewerCount: number } | null) => void = () => {}
	const fedCounts: number[] = []

	// start the poll on the read
	const stop = startCountsPoll<{ viewerCount: number }>({
		readCounts: (signal) => {
			receivedSignal = signal
			return new Promise((resolve) => {
				resolveRead = resolve
			})
		},
		onCounts: (counts) => fedCounts.push(counts.viewerCount),
	})

	// the stop aborts, and the result that arrives after it is dropped
	stop()
	expect(receivedSignal?.aborted).toBe(true)
	resolveRead({ viewerCount: 5 })
	await settle()
	expect(fedCounts).toEqual([])
})

// a page that shows its saved counts waits a tick before its first read
test("a poll that starts from saved counts reads first a tick later", async () => {
	jest.useFakeTimers()
	try {
		// the reads taken, with no read at the start
		let readCount = 0
		const stop = startCountsPoll({
			readCounts: async () => {
				readCount += 1
				return { viewerCount: readCount }
			},
			onCounts: () => {},
			pollMs: 1_000,
			isReadingAtStart: false,
		})
		await settle()
		expect(readCount).toBe(0)

		// the first read lands a tick later
		await advancePolls({ pollMs: 1_000, pollCount: 1 })
		expect(readCount).toBe(1)
		stop()
	} finally {
		// put the real clock back
		jest.useRealTimers()
	}
})
