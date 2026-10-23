// a user's spend reservations: a model call's largest cost held against the monthly budget while the call runs, in a
// Redis sorted set that every replica reads. the budget is a soft limit: a call starts while the recorded spend and the
// open reservations are below it, so the month can pass the budget by about one call's largest cost. if Redis cannot
// run a reservation, the call falls back to the check of recorded spend against the budget
import { userBudgetCents } from "@carlnotes/contracts/plans"
import { loadUserAccess, monthlySpendDollars, toSpendCents } from "@carlnotes/db/quotas"
import { runWithRedis } from "@carlnotes/db/redis"

// the kinds of call that reserve: a chat turn, a spoken question's transcription, and one spoken part of a reply
export type SpendReservationKind = "chatTurn" | "transcription" | "speech"

// how long each kind's reservation lasts if nothing releases it: the call's longest run plus a minute
const RESERVATION_MS_BY_KIND: Record<SpendReservationKind, number> = {
	chatTurn: 16 * 60 * 1000,
	transcription: 6 * 60 * 1000,
	speech: 6 * 60 * 1000,
}

// a script that removes the expired reservations, sums the open ones, and adds the new one if the open ones are below
// the remaining budget, whatever the new one holds. each member is "<id>:<dollars>", scored by when it expires, and the
// key expires with its latest member. the reply is 1 if the reservation was added and 0 if the budget was taken
const RESERVE_SPEND_SCRIPT = [
	"redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])",
	"local openDollars = 0",
	"for _, member in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do",
	"  openDollars = openDollars + tonumber(string.match(member, ':([^:]+)$'))",
	"end",
	"if openDollars >= tonumber(ARGV[2]) then return 0 end",
	"redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])",
	"local latestMember = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')",
	"redis.call('PEXPIREAT', KEYS[1], latestMember[2])",
	"return 1",
].join("\n")

// one call's reservation, released once the call's spend row is written or the call fails
export type SpendReservation = { release: () => Promise<void> }

// the user to reserve for, the kind of call, and the call's largest cost
export type ReserveUserSpendOptions = { userId: string; kind: SpendReservationKind; maxDollars: number }

/**
 * Reserves a call's largest cost against the user's monthly budget if the recorded spend and every open reservation are
 * below it, even if the call's largest cost would take the month past it, and returns "rejected" otherwise. A running
 * call therefore rejects the next until it releases, if its reservation took the rest of the budget. A spoken part is
 * rejected by recorded spend alone. If Redis cannot run the reservation, a call under budget runs.
 */
export async function reserveUserSpend({
	userId,
	kind,
	maxDollars,
}: ReserveUserSpendOptions): Promise<SpendReservation | "rejected"> {
	// what remains of the budget after the recorded spend, rounded to cents as every budget check rounds it.
	// a spent budget rejects every kind of call
	const remainingDollars = await loadRemainingDollars(userId)
	if (remainingDollars <= 0) {
		return "rejected"
	}

	// reserve the call's largest cost under a member of its own that expires with the kind's longest run
	const key = toReservationsKey(userId)
	const member = `${crypto.randomUUID()}:${maxDollars.toFixed(6)}`
	const now = Date.now()
	const expiresAt = now + RESERVATION_MS_BY_KIND[kind]

	// a spoken part speaks a reply whose chat turn already holds a reservation, often while that turn still streams, so
	// the open reservations never reject it. the script's arguments: now, the open dollars that reject the call, the
	// expiry, and the member
	const rejectingOpenDollars = kind === "speech" ? Number.MAX_SAFE_INTEGER : remainingDollars
	const scriptArguments = [String(now), rejectingOpenDollars.toFixed(6), String(expiresAt), member]
	const scriptReply = await runWithRedis("reserveUserSpend", (client) =>
		client.send("EVAL", [RESERVE_SPEND_SCRIPT, "1", key, ...scriptArguments]),
	)

	// the script rejects a call once the open reservations reach what remains of the budget. the reply may arrive as an
	// integer or a big integer
	const reserveOutcome = Number(scriptReply)
	if (reserveOutcome === 0 && scriptReply !== null) {
		return "rejected"
	}

	// a reserved call, and one whose script failed and runs under the recorded spend alone, both release the member.
	// a script that timed out may still have added it
	return { release: () => releaseReservation(key, member) }
}

/**
 * Returns a rejection handler for a call that fails before the code that releases its reservation runs: it releases
 * the reservation, if there is one, then throws the error again.
 */
export function toReleaseOnFailure(reservation: SpendReservation | null): (error: unknown) => Promise<never> {
	return async (error) => {
		await reservation?.release()
		throw error
	}
}

// the budget less the month's recorded spend, in dollars
async function loadRemainingDollars(userId: string): Promise<number> {
	const [userAccess, monthlySpend] = await Promise.all([loadUserAccess(userId), monthlySpendDollars(userId)])
	return (userBudgetCents(userAccess) - toSpendCents(monthlySpend)) / 100
}

// remove one reservation. a removal that Redis could not run leaves the reservation to expire
async function releaseReservation(key: string, member: string): Promise<void> {
	await runWithRedis("releaseUserSpend", (client) => client.send("ZREM", [key, member]))
}

// the sorted set that holds one user's reservations
function toReservationsKey(userId: string): string {
	return `spend-reservations:${userId}`
}
