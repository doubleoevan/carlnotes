// the event loop delay histogram reads a blocked loop as its delay, and a reset clears it
import { expect, test } from "bun:test"
import { readEventLoopDelay, resetEventLoopDelay, startEventLoopDelay } from "./eventLoopDelay"

// wait a number of milliseconds without blocking the event loop
function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// a 100 ms block reads as roughly 100 ms, and after a reset the largest delay is small again
test("a blocked event loop reads as its delay until a reset", async () => {
	startEventLoopDelay()
	resetEventLoopDelay()

	// block the loop for 100 ms inside a timer, then let the histogram sample the recovery
	setTimeout(() => {
		const blockUntil = Date.now() + 100
		while (Date.now() < blockUntil) {}
	}, 30)
	await wait(300)
	expect(readEventLoopDelay().maxMs).toBeGreaterThanOrEqual(70)
	expect(readEventLoopDelay().maxMs).toBeLessThan(250)

	// a reset starts a fresh window
	resetEventLoopDelay()
	await wait(100)
	expect(readEventLoopDelay().maxMs).toBeLessThan(50)
})
