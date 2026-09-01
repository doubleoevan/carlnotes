// the scan poll's rate: fast while a scan is young, slower the longer it has been watched
import { expect, test } from "bun:test"
import { toScanPollMs } from "./useTopicScan"

// a scan that just started refetches quickly, so the first findings land on screen without a wait
test("a young scan polls fast", () => {
	expect(toScanPollMs(0)).toBe(3000)
	expect(toScanPollMs(29_999)).toBe(3000)
})

// past the first half minute the rate steps down, then down again
test("a longer scan steps the rate down", () => {
	expect(toScanPollMs(30_000)).toBe(10_000)
	expect(toScanPollMs(119_999)).toBe(10_000)
	expect(toScanPollMs(120_000)).toBe(30_000)
})

// a five-minute scan costs a fraction of what one rate would have
test("a five minute scan is far cheaper than a fixed fast poll", () => {
	// the ticks the stepped rate spends across five minutes, against 100 at a flat three seconds
	let watchedMs = 0
	let ticks = 0
	while (watchedMs < 300_000) {
		watchedMs += toScanPollMs(watchedMs)
		ticks += 1
	}
	expect(ticks).toBeLessThan(30)
})
