// the limits and weights behind reactions and comments: an account's daily writes, and how much each account's
// reaction counts toward a Finding's reaction signal
import { DAY_MS } from "@carlnotes/contracts/time"
import { inArray } from "drizzle-orm"
import { db } from "./index"
import { loadAcceptedInviteShares, toAccountSignalWeight } from "./inviteLimits"
import { toUtcDay } from "./quotas"
import { countRateLimitHit } from "./redisRateLimits"
import { users } from "./schema/users"

// how many reactions an account may save and how many comments it may post in a day, far above what a person does.
// the limits do not vary with the account's age or plan
const DAILY_SOCIAL_WRITE_LIMIT = 200

// what a daily write limit counts
export type SocialWriteKind = "reaction" | "comment"

/**
 * Counts one save or post against the user's UTC day and returns whether it is within the daily limit. The count
 * lives in Redis, so a deleted reaction or comment still counts.
 */
export function countSocialWriteToday(userId: string, socialWriteKind: SocialWriteKind): Promise<boolean> {
	return countRateLimitHit({
		key: `social-${socialWriteKind}:${toUtcDay(new Date())}:${userId}`,
		rateLimitWindowMs: DAY_MS,
		limit: DAILY_SOCIAL_WRITE_LIMIT,
	})
}

/**
 * Returns each user's account signal weight, from their account age and their accepted share of invitations. A user
 * with no row has no entry.
 */
export async function loadAccountSignalWeights(userIds: string[]): Promise<Map<string, number>> {
	if (userIds.length === 0) {
		return new Map()
	}

	// read each account's creation time and accepted invite share together
	const [userRows, acceptedInviteShares] = await Promise.all([
		db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(inArray(users.id, userIds)),
		loadAcceptedInviteShares(userIds),
	])

	// weigh each account by its age in days and its accepted share
	const now = Date.now()
	return new Map(
		userRows.map((userRow) => [
			userRow.id,
			toAccountSignalWeight({
				accountAgeDays: (now - userRow.createdAt.getTime()) / DAY_MS,
				acceptedShare: acceptedInviteShares.get(userRow.id) ?? null,
			}),
		]),
	)
}
