// Resend limit tests over a fake Redis server and a fake clock: each limit's own slot and length, an account email
// that leaves while calls wait for the shared slot, and a burst of account emails that leaves one slot apart
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient } from "./redisClientStub"
import { type FakeRedisServer, startFakeRedisStore } from "./redisFakeServer"
import { waitForAccountEmailSlot, waitForResendSlot } from "./resendRateLimit"

// the fake clock's start, and each limit's slot key in Redis
const CLOCK_START_MS = 1_700_000_000_000
const RESEND_SLOT_KEY = "rate-limit:resend-calls"
const ACCOUNT_EMAIL_SLOT_KEY = "rate-limit:resend-account-emails"

// the fake clock's time, the sleeps waiting on it with the time each wakes at, and the fake server
let nowMs = CLOCK_START_MS
let sleepers: { wakeAtMs: number; wake: () => void }[] = []
let fakeRedisServer: FakeRedisServer

// a fresh fake server, a clock that only a test moves, and the jitter at its top
beforeEach(() => {
	fakeRedisServer = startFakeRedisStore().fakeRedisServer
	nowMs = CLOCK_START_MS
	sleepers = []
	spyOn(Date, "now").mockImplementation(() => nowMs)
	spyOn(Math, "random").mockReturnValue(1)

	// a sleep waits on the fake clock instead of the real one
	spyOn(Bun, "sleep").mockImplementation(
		(delay) =>
			new Promise<void>((wake) => {
				sleepers.push({ wakeAtMs: nowMs + Number(delay), wake })
			}),
	)
})

// put the real client builder, clock, random, and sleep back
afterEach(() => {
	restoreRedisClient()
	mock.restore()
})

// let every running call reach its next sleep or leave
function settleCalls(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve))
}

// wake the sleepers in the order of their wake times, moving the clock to each, until none is left
async function runFakeClock(): Promise<void> {
	for (;;) {
		// the earliest sleeper once every running call has settled
		await settleCalls()
		const [nextSleeper] = sleepers.toSorted((first, second) => first.wakeAtMs - second.wakeAtMs)
		if (!nextSleeper) {
			return
		}

		// move the clock to the sleeper's wake time, then wake it
		sleepers = sleepers.filter((sleeper) => sleeper !== nextSleeper)
		nowMs = nextSleeper.wakeAtMs
		nextSleeper.wake()
	}
}

// start the given number of calls at once, run the clock until all have left, and return the time each left at
async function runCallsAtOnce(callCount: number, waitForSlot: () => Promise<void>): Promise<number[]> {
	const leftAtMs: number[] = []
	const slotCalls = Array.from({ length: callCount }, () => waitForSlot().then(() => leftAtMs.push(nowMs)))
	await runFakeClock()
	await Promise.all(slotCalls)
	return leftAtMs
}

// the shortest time between two calls that left one after the other
function toShortestGapMs(leftAtMs: number[]): number {
	const gapsMs = leftAtMs.slice(1).map((leftAt, i) => leftAt - (leftAtMs[i] ?? 0))
	return Math.min(...gapsMs)
}

// the shared limit holds its slot for 200 milliseconds and the account emails' limit holds its own for 250
test("each limit takes its own slot for its own length", async () => {
	await waitForResendSlot()
	await waitForAccountEmailSlot()
	expect(fakeRedisServer.slotFreesAtByKey.get(RESEND_SLOT_KEY)).toBe(CLOCK_START_MS + 200)
	expect(fakeRedisServer.slotFreesAtByKey.get(ACCOUNT_EMAIL_SLOT_KEY)).toBe(CLOCK_START_MS + 250)
})

// a bulk send whose calls are waiting for the shared slot does not hold up an account email
test("an account email leaves at once while calls wait for the shared slot", async () => {
	// five calls of the shared limit start together, so one takes the slot and four are waiting
	const sharedCalls = Array.from({ length: 5 }, () => waitForResendSlot())
	await settleCalls()
	expect(sleepers).toHaveLength(4)

	// the account email takes its own slot with no wait, while the four are still waiting
	await waitForAccountEmailSlot()
	expect(nowMs).toBe(CLOCK_START_MS)
	expect(sleepers).toHaveLength(4)

	// the waiting calls leave once the clock runs
	await runFakeClock()
	await Promise.all(sharedCalls)
})

// twenty signups' verification emails take twenty slots, none leaving within 250 milliseconds of another, and all
// inside the ten second wait limit
test("twenty account emails sent at once leave one slot apart, and none without a slot", async () => {
	const leftAtMs = await runCallsAtOnce(20, waitForAccountEmailSlot)
	expect(leftAtMs).toHaveLength(20)
	expect(toShortestGapMs(leftAtMs)).toBeGreaterThanOrEqual(250)
	expect((leftAtMs.at(-1) ?? 0) - CLOCK_START_MS).toBeLessThan(10_000)
})

// twenty calls of the shared limit leave no closer than 200 milliseconds apart, and never in a burst
test("twenty calls waiting for the shared slot leave one at a time", async () => {
	const leftAtMs = await runCallsAtOnce(20, waitForResendSlot)
	expect(leftAtMs).toHaveLength(20)
	expect(toShortestGapMs(leftAtMs)).toBeGreaterThanOrEqual(200)
})

// a call whose wait would pass the ten second limit goes out without a slot, so a backlog never holds a send for good
test("a call that would wait past the wait limit leaves without a slot", async () => {
	// fifty account emails need more than ten seconds of slots, so the last ones leave together inside the wait limit
	const leftAtMs = await runCallsAtOnce(50, waitForAccountEmailSlot)
	expect(leftAtMs).toHaveLength(50)
	expect(toShortestGapMs(leftAtMs)).toBeLessThan(250)
	expect((leftAtMs.at(-1) ?? 0) - CLOCK_START_MS).toBeLessThanOrEqual(10_000)
})

// a call goes out without a slot while Redis cannot be reached
test("a call leaves without a slot if Redis cannot run the slot script", async () => {
	spyOn(console, "error").mockImplementation(() => {})
	fakeRedisServer.isCommandFailing = true
	await waitForAccountEmailSlot()
	await waitForResendSlot()
	expect(sleepers).toHaveLength(0)
	expect(fakeRedisServer.slotFreesAtByKey.size).toBe(0)
})
