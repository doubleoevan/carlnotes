// spend reservation tests over the fake Redis server: the soft budget that lets a call with budget left start, the
// rejection of a second call while the first holds the rest, a release once the spend row is written, an expiry after a
// crash, and the fallback while Redis is down
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as quotas from "@carlnotes/db/quotas"
import { readAndResetRedisGauges } from "@carlnotes/db/redis"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import { type FakeRedisServer, startFakeRedisStore } from "@carlnotes/db/redisFakeServer"
import { reserveUserSpend } from "./spendReservations"

// the user's one dollar budget, and the chat spend their spend rows record so far
const BUDGET_CENTS = 100
let recordedChatDollars = 0

// the fake server that each test's store talks to, the user's access row and recorded spend, and a quiet console
let fakeRedisServer: FakeRedisServer
beforeEach(() => {
	fakeRedisServer = startFakeRedisStore().fakeRedisServer
	recordedChatDollars = 0.4
	spyOn(quotas, "loadUserAccess").mockResolvedValue({ isAdmin: false, plan: "free", budgetOverrideCents: BUDGET_CENTS })
	spyOn(quotas, "monthlySpendDollars").mockImplementation(async () => ({
		scanDollars: 0,
		chatDollars: recordedChatDollars,
		podcastEpisodeDollars: 0,
	}))
	spyOn(console, "error").mockImplementation(() => {})
})

// restore every spy and the store's own client after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// reserve a chat turn's largest cost for user-1
function reserveChatTurn(maxDollars: number): ReturnType<typeof reserveUserSpend> {
	return reserveUserSpend({ userId: "user-1", kind: "chatTurn", maxDollars })
}

// sixty cents remain, so a turn whose largest cost is five dollars still starts: a user with budget left is never
// rejected
test("a call starts with budget left even if its largest cost would pass the budget", async () => {
	expect(await reserveChatTurn(5)).not.toBe("rejected")
})

// a running turn whose reservation took the rest of the budget rejects the next turn until it releases
test("a second call is rejected while the first holds the rest of the budget", async () => {
	// the first turn reserves more than the sixty cents that remain, so a second turn finds the budget taken
	const firstReservation = await reserveChatTurn(0.74)
	if (firstReservation === "rejected") {
		throw new Error("the first turn was rejected")
	}
	expect(await reserveChatTurn(0.74)).toBe("rejected")

	// the first turn ends at three cents and releases, and the next turn starts
	recordedChatDollars += 0.03
	await firstReservation.release()
	expect(await reserveChatTurn(0.74)).not.toBe("rejected")
})

// a spoken part speaks a reply whose turn already holds the rest of the budget, so only recorded spend rejects it
test("a spoken part starts while the user's own turn holds the rest of the budget", async () => {
	// the turn's reservation takes everything that remains, so another turn is rejected
	expect(await reserveChatTurn(0.74)).not.toBe("rejected")
	expect(await reserveChatTurn(0.74)).toBe("rejected")

	// the spoken parts of its reply still start, and a spent budget rejects them
	const speakPart = (): ReturnType<typeof reserveUserSpend> =>
		reserveUserSpend({ userId: "user-1", kind: "speech", maxDollars: 0.05 })
	expect(await speakPart()).not.toBe("rejected")
	recordedChatDollars = 1
	expect(await speakPart()).toBe("rejected")
})

// five turns racing on any replica start while the open reservations are below the sixty cents that remain, so what
// they hold passes the budget by less than one turn's largest cost
test("concurrent calls pass the budget by less than one call's largest cost", async () => {
	const reservations = await Promise.all([0.25, 0.25, 0.25, 0.25, 0.25].map(reserveChatTurn))
	const reservedCount = reservations.filter((reservation) => reservation !== "rejected").length
	expect(reservedCount).toBe(3)
	expect(reservedCount * 0.25 - 0.6).toBeLessThan(0.25)
})

// a turn that reserved its maximum and cost a quarter of it leaves the remaining budget lower by its actual cost alone
test("settling returns the difference between the maximum and the actual cost", async () => {
	// the turn reserves all sixty cents that remain, so nothing else starts while it runs
	const reservation = await reserveChatTurn(0.6)
	if (reservation === "rejected") {
		throw new Error("the turn was rejected")
	}
	expect(await reserveChatTurn(0.01)).toBe("rejected")

	// the turn ends at fifteen cents: its spend row is written, then its reservation released
	recordedChatDollars += 0.15
	await reservation.release()

	// forty-five cents remain, exactly the budget less the recorded spend: reservations start until they reach it
	expect(await reserveChatTurn(0.44)).not.toBe("rejected")
	expect(await reserveChatTurn(0.01)).not.toBe("rejected")
	expect(await reserveChatTurn(0.01)).toBe("rejected")
})

// a process that dies holding a reservation stops holding the budget once the turn's longest run has passed
test("an unsettled reservation expires on its own", async () => {
	// a turn reserves everything that remains and is never released
	expect(await reserveChatTurn(0.6)).not.toBe("rejected")
	expect(await reserveChatTurn(0.6)).toBe("rejected")

	// past the chat turn's longest run and its margin, the next turn starts again
	const now = Date.now()
	spyOn(Date, "now").mockReturnValue(now + 16 * 60 * 1000 + 1)
	expect(await reserveChatTurn(0.6)).not.toBe("rejected")
})

// a user whose recorded spend has reached the budget is rejected, whatever the call's largest cost
test("a spent budget rejects every call", async () => {
	recordedChatDollars = 1
	expect(await reserveChatTurn(0.01)).toBe("rejected")
})

// with Redis down, a user under budget is allowed whatever the call's maximum, a spent budget is rejected, and each
// outage counts on the minute line
test("Redis down allows a call under today's check of recorded spend against the budget", async () => {
	// the reservation cannot run, so a call runs unreserved
	readAndResetRedisGauges()
	fakeRedisServer.isCommandFailing = true
	const reservation = await reserveChatTurn(5)
	expect(reservation).not.toBe("rejected")
	expect(readAndResetRedisGauges().errorCount).toBe(1)

	// a spent budget is rejected, as it is today
	recordedChatDollars = 1
	expect(await reserveChatTurn(0.01)).toBe("rejected")
})
