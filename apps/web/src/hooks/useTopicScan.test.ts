// the topic scan's poll rate: fast while a scan is new, slower the longer it has been watched. the poll itself runs one
// reload at a time, and a hidden page stops it
import { afterEach, expect, test } from "bun:test"
import { startScanPoll, toScanPollMs } from "./useTopicScan"

// a scan that just started refetches quickly, so the first findings land on screen without a wait
test("a new scan polls fast", () => {
	expect(toScanPollMs(0)).toBe(3000)
	expect(toScanPollMs(29_999)).toBe(3000)
})

// past the first half-minute the poll rate slows down, then down again
test("a longer scan slows the poll rate down", () => {
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

// the real timers, restored after the poll tests, and the ticks the stubbed setTimeout collects instead of running
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
const scheduledTicks: (() => void)[] = []

// a page that starts visible, whose one visibility listener the test fires by hand
let visibilityListener: (() => void) | null = null
const fakeDocument = {
	visibilityState: "visible",
	addEventListener: (_eventName: string, listener: () => void) => {
		visibilityListener = listener
	},
	removeEventListener: () => {},
}

// stub the timers and the document for one poll
function stubPollGlobals(): void {
	globalThis.setTimeout = ((tick: () => void) => scheduledTicks.push(tick)) as unknown as typeof setTimeout
	globalThis.clearTimeout = (() => {}) as typeof clearTimeout
	Object.assign(globalThis, { document: fakeDocument })
}

// remove the stubbed globals after each poll test
afterEach(() => {
	globalThis.setTimeout = realSetTimeout
	globalThis.clearTimeout = realClearTimeout
	scheduledTicks.length = 0
	visibilityListener = null
	fakeDocument.visibilityState = "visible"
	Reflect.deleteProperty(globalThis, "document")
})

// a reload the test settles by hand, counting its calls
function toManualReload(): {
	reload: () => Promise<void>
	settleReload: () => Promise<void>
	readReloadCount: () => number
} {
	let reloadCount = 0
	let resolveReload = (): void => {}
	return {
		// count the reload and hold it open until the test settles it
		reload: () => {
			reloadCount += 1
			return new Promise<void>((resolve) => {
				resolveReload = resolve
			})
		},
		// settle the reload, then let its finally handler run
		settleReload: async () => {
			resolveReload()
			await new Promise<void>((resolve) => realSetTimeout(resolve, 0))
		},
		readReloadCount: () => reloadCount,
	}
}

// a slow reload holds the next tick until it settles, so two requests never run at once
test("startScanPoll schedules the next tick only once the previous reload settles", async () => {
	stubPollGlobals()
	const { reload, settleReload, readReloadCount } = toManualReload()
	const stopScanPoll = startScanPoll(reload)
	expect(scheduledTicks).toHaveLength(1)

	// the first tick starts a reload, and no tick is scheduled while it is in flight
	scheduledTicks[0]?.()
	expect(readReloadCount()).toBe(1)
	expect(scheduledTicks).toHaveLength(1)

	// the settled reload schedules the next tick
	await settleReload()
	expect(scheduledTicks).toHaveLength(2)

	// a reload in flight when the poll stops schedules nothing once it settles
	scheduledTicks[1]?.()
	stopScanPoll()
	await settleReload()
	expect(scheduledTicks).toHaveLength(2)
})

// a hidden page ends the poll, its in-flight reload included, and a page shown again reloads right away and polls on
test("startScanPoll stops on a hidden page and restarts on a shown one", async () => {
	stubPollGlobals()
	const { reload, settleReload, readReloadCount } = toManualReload()
	startScanPoll(reload)
	scheduledTicks[0]?.()

	// the page hides while the reload is in flight, so settling it schedules nothing
	fakeDocument.visibilityState = "hidden"
	visibilityListener?.()
	await settleReload()
	expect(scheduledTicks).toHaveLength(1)

	// the page shows again, which reloads at once and then schedules the next tick
	fakeDocument.visibilityState = "visible"
	visibilityListener?.()
	expect(readReloadCount()).toBe(2)
	await settleReload()
	expect(scheduledTicks).toHaveLength(2)
})
