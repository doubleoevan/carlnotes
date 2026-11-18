// Reserve distinct paid animations across all films belonging to an account.
import { isAdminRole } from "@carlnotes/contracts/enums"
import { PLANS } from "@carlnotes/contracts/plans"
import { and, count, eq } from "drizzle-orm"
import { db } from "./index"
import { startOfUtcMonth } from "./quotas"
import { podcastEpisodes, topicVideoAnimationUses } from "./schema/podcast"
import { users } from "./schema/users"

type AnimationAllowance =
	| { kind: "full" }
	| { kind: "reuse"; episodeId: string }
	| { kind: "reserved"; id: string; platformPays: boolean }

/** Reserves one account slot for the picture or returns the episode that already generated it. */
export async function reserveTopicVideoAnimation(
	ownerId: string,
	episodeId: string,
	sourceImageHash: string,
): Promise<AnimationAllowance> {
	return db.transaction(async (tx) => {
		// Serialize admission across this owner's Topics and check who owns the episode.
		const [owner] = await tx
			.select({ plan: users.plan, role: users.role })
			.from(users)
			.innerJoin(podcastEpisodes, and(eq(podcastEpisodes.id, episodeId), eq(podcastEpisodes.ownerId, users.id)))
			.where(eq(users.id, ownerId))
			.for("update", { of: users })
		if (!owner) {
			throw Error("Missing film owner for animation allowance")
		}

		// Reuse a known picture even when all the month's slots have been taken.
		const month = startOfUtcMonth(new Date())
		const period = and(eq(topicVideoAnimationUses.ownerId, ownerId), eq(topicVideoAnimationUses.month, month))
		const [known] = await tx
			.select({ episodeId: topicVideoAnimationUses.episodeId })
			.from(topicVideoAnimationUses)
			.where(and(period, eq(topicVideoAnimationUses.sourceImageHash, sourceImageHash)))
		if (known) {
			return known.episodeId && known.episodeId !== episodeId
				? { kind: "reuse", episodeId: known.episodeId }
				: { kind: "full" }
		}

		// Extra admin shots leave the plan slot available if its original reservation is released.
		const [used] = await tx
			.select({ slots: count() })
			.from(topicVideoAnimationUses)
			.where(and(period, eq(topicVideoAnimationUses.usesPlanAllowance, true)))
		const hasPlanSlot = (used?.slots ?? 0) < PLANS[owner.plan].monthlyFilmAnimationLimit
		if (!hasPlanSlot && !isAdminRole(owner.role)) {
			return { kind: "full" }
		}

		// Record admin reservations too. Only the Free plan's first picture is platform-funded.
		const [row] = await tx
			.insert(topicVideoAnimationUses)
			.values({ month, ownerId, episodeId, sourceImageHash, usesPlanAllowance: hasPlanSlot })
			.returning({ id: topicVideoAnimationUses.id })
		if (!row) {
			throw Error("The animation allowance could not be reserved")
		}
		return { kind: "reserved", id: row.id, platformPays: owner.plan === "free" && hasPlanSlot }
	})
}

/** Releases a reserved slot if generation fails before submission. */
export async function releaseTopicVideoAnimation(id: string): Promise<void> {
	await db.delete(topicVideoAnimationUses).where(eq(topicVideoAnimationUses.id, id))
}
