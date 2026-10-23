// the visible-only poll: one reload at a time, stopped on a hidden page, and restarted on a shown one
import { afterEach, expect, test } from "bun:test"
import { startVisiblePoll } from "./visiblePoll"

// the wait between reloads in these tests, which the stubbed timers never actually wait
const POLL_MS = 60_000

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
test("startVisiblePoll schedules the next tick only once the previous reload settles", async () => {
	stubPollGlobals()
	const { reload, settleReload, readReloadCount } = toManualReload()
	const stopPoll = startVisiblePoll({ reload, toPollMs: () => POLL_MS })
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
	stopPoll()
	await settleReload()
	expect(scheduledTicks).toHaveLength(2)
})

// a hidden page ends the poll, its in-flight reload included, and a page shown again reloads right away and polls on
test("startVisiblePoll stops on a hidden page and restarts on a shown one", async () => {
	stubPollGlobals()
	const { reload, settleReload, readReloadCount } = toManualReload()
	startVisiblePoll({ reload, toPollMs: () => POLL_MS })
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

// a page shown again while a reload is in flight waits for that reload instead of sending a second one
test("startVisiblePoll never overlaps a reload across a hide and a show", async () => {
	stubPollGlobals()
	const { reload, settleReload, readReloadCount } = toManualReload()
	startVisiblePoll({ reload, toPollMs: () => POLL_MS })
	scheduledTicks[0]?.()

	// the page hides and shows while the first reload is in flight, which sends nothing new
	fakeDocument.visibilityState = "hidden"
	visibilityListener?.()
	fakeDocument.visibilityState = "visible"
	visibilityListener?.()
	expect(readReloadCount()).toBe(1)

	// the settled reload schedules the shown page's next tick
	await settleReload()
	expect(scheduledTicks).toHaveLength(2)
})

// a poll that reloads at start reads at once on a visible page, and waits for a hidden page to show
test("startVisiblePoll reloads at start only on a visible page", () => {
	stubPollGlobals()
	const { reload, readReloadCount } = toManualReload()
	fakeDocument.visibilityState = "hidden"
	startVisiblePoll({ reload, toPollMs: () => POLL_MS, isReloadingAtStart: true })
	expect(readReloadCount()).toBe(0)

	// the page shows, which sends the first read
	fakeDocument.visibilityState = "visible"
	visibilityListener?.()
	expect(readReloadCount()).toBe(1)
})
