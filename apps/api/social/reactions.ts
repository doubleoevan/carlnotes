// the reaction write: a save of the user's one reaction on a social target, which a save with no type removes
import { type ReactionSummary, type SaveReactionPayload, toSocialEventTarget } from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { reactions } from "@carlnotes/db/schema/social"
import { countSocialWriteToday } from "@carlnotes/db/socialLimits"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq, isNotNull } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { loadReactionSummary } from "./reactionRows"
import { toReactionTargetColumn, toSocialTargetValues } from "./socialTargetColumns"
import { type ResolvedSocialTarget, resolvePostableSocialTarget } from "./socialTargets"

// how a save ended: the social target's summary as it stands now, or why nothing was written
export type ReactionWriteResult =
	| { status: "saved"; summary: ReactionSummary }
	| { status: "notFound" }
	| { status: "limitReached" }

// who saves, what they save, and the request's analytics properties
type SaveReactionOptions = { userId: string; payload: SaveReactionPayload; analyticsProperties: AnalyticsProperties }

/**
 * Saves the user's reaction on a social target: a new one, a change of its type, or its removal if the save has no
 * type.
 */
export async function saveReaction({
	userId,
	payload,
	analyticsProperties,
}: SaveReactionOptions): Promise<ReactionWriteResult> {
	// the social target, for a user who may post on it. a missing one and a rejected post read the same
	const { target, reactionType } = payload
	const resolvedSocialTarget = await resolvePostableSocialTarget(userId, target)
	if (!resolvedSocialTarget) {
		return { status: "notFound" }
	}
	const targetColumn = toReactionTargetColumn(target.kind)
	const ownReactionFilter = and(eq(targetColumn, target.id), eq(reactions.userId, userId))
	const eventProperties = toSocialEventProperties({
		analyticsProperties,
		userId,
		resolvedSocialTarget,
		objectId: target.id,
	})

	// no type removes the user's own reaction
	if (reactionType === null) {
		const deletedRows = await db.delete(reactions).where(ownReactionFilter).returning({ id: reactions.id })
		if (deletedRows.length > 0) {
			trackEvent("social_reaction_delete", userId, eventProperties)
		}
		return { status: "saved", summary: await loadReactionSummary(userId, target) }
	}

	// the same type again changes nothing
	const [ownReactionRow] = await db
		.select({ reactionType: reactions.reactionType })
		.from(reactions)
		.where(ownReactionFilter)
	if (ownReactionRow?.reactionType === reactionType) {
		return { status: "saved", summary: await loadReactionSummary(userId, target) }
	}

	// a new reaction counts against the day
	if (!ownReactionRow && !(await countSocialWriteToday(userId, "reaction"))) {
		return { status: "limitReached" }
	}

	// write the user's one row on this social target
	const now = new Date()
	await db
		.insert(reactions)
		.values({ userId, ...toSocialTargetValues(target), reactionType, createdAt: now })
		.onConflictDoUpdate({
			target: [reactions.userId, targetColumn],
			targetWhere: isNotNull(targetColumn),
			set: { reactionType, updatedAt: now },
		})
	trackEvent(`social_${toSocialEventTarget(target.kind)}_react`, userId, eventProperties)
	return { status: "saved", summary: await loadReactionSummary(userId, target) }
}

// the request's analytics properties, the user, the social target the event is about, and the object's id
type ToSocialEventPropertiesOptions = {
	analyticsProperties: AnalyticsProperties
	userId: string
	resolvedSocialTarget: ResolvedSocialTarget
	objectId: string
}

/**
 * Returns a social event's properties: the object's id, its Topic's id, and whether the user owns that Topic. Never
 * any text.
 */
export function toSocialEventProperties({
	analyticsProperties,
	userId,
	resolvedSocialTarget,
	objectId,
}: ToSocialEventPropertiesOptions): AnalyticsProperties & { objectId: string; topicId: string; isOwner: boolean } {
	const { topic } = resolvedSocialTarget
	return { ...analyticsProperties, objectId, topicId: topic.id, isOwner: topic.ownerId === userId }
}
