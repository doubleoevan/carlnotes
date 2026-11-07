// what a Topic's reactions and comments count for in a Scan: each Finding's weighted reaction signal, and the Findings
// that hold someone's comment. no text is read here
import { COMMENT_SIGNAL, REACTION_SIGNAL } from "@carlnotes/contracts/sourceScoring"
import { db } from "@carlnotes/db"
import { toVisibleAuthorFilter } from "@carlnotes/db/contentFilters"
import { findings } from "@carlnotes/db/schema/scans"
import { comments, reactions } from "@carlnotes/db/schema/social"
import { loadAccountSignalWeights } from "@carlnotes/db/socialLimits"
import { and, eq } from "drizzle-orm"

// one thing a user did on a Finding, as the signal reads it: a reaction, or one or more comments
export type ReactionSignalRow = { findingId: string; userId: string; kind: "reaction" | "comment" }

/**
 * Returns each Finding's reaction signal: the sum of what its users did, a comment weighing more than a reaction,
 * each times its author's account weight. An author with no weight counts for nothing.
 */
export function toFindingReactionSignals(
	reactionSignalRows: ReactionSignalRow[],
	accountSignalWeights: Map<string, number>,
): Map<string, number> {
	// add each row's weighted signal to its Finding's sum
	const findingReactionSignals = new Map<string, number>()
	for (const { findingId, userId, kind } of reactionSignalRows) {
		const reactionSignal =
			(kind === "comment" ? COMMENT_SIGNAL : REACTION_SIGNAL) * (accountSignalWeights.get(userId) ?? 0)
		findingReactionSignals.set(findingId, (findingReactionSignals.get(findingId) ?? 0) + reactionSignal)
	}
	return findingReactionSignals
}

/**
 * Loads the reaction signal of each of a Topic's Findings that has a reaction or a comment. A user's comments on one
 * Finding count once, however many they wrote. An author under an admin block, or in a user block with the Topic's
 * owner, is left out.
 */
export async function loadFindingReactionSignals(topicId: string, ownerId: string): Promise<Map<string, number>> {
	// each reaction on the Topic's Findings, and each Finding's commenters once
	const [reactionRows, commentRows] = await Promise.all([
		db
			.select({ findingId: findings.id, userId: reactions.userId })
			.from(reactions)
			.innerJoin(findings, eq(reactions.findingId, findings.id))
			.where(and(eq(findings.topicId, topicId), toVisibleAuthorFilter(ownerId, reactions.userId))),
		db
			.selectDistinct({ findingId: findings.id, userId: comments.authorUserId })
			.from(comments)
			.innerJoin(findings, eq(comments.findingId, findings.id))
			.where(and(eq(findings.topicId, topicId), toVisibleAuthorFilter(ownerId, comments.authorUserId))),
	])
	const reactionSignalRows: ReactionSignalRow[] = [
		...reactionRows.map((reactionRow) => ({ ...reactionRow, kind: "reaction" as const })),
		...commentRows.flatMap(({ findingId, userId }) =>
			userId ? [{ findingId, userId, kind: "comment" as const }] : [],
		),
	]

	// weigh each author's account once, however many Findings they reacted to
	const authorUserIds = [...new Set(reactionSignalRows.map((signalRow) => signalRow.userId))]
	return toFindingReactionSignals(reactionSignalRows, await loadAccountSignalWeights(authorUserIds))
}

/**
 * Loads the ids of a Topic's Findings that hold a comment from an author who is under no admin block and in no user block
 * with the Topic's owner.
 */
export async function loadFindingIdsWithComments(topicId: string, ownerId: string): Promise<string[]> {
	const commentRows = await db
		.selectDistinct({ findingId: findings.id })
		.from(comments)
		.innerJoin(findings, eq(comments.findingId, findings.id))
		.where(and(eq(findings.topicId, topicId), toVisibleAuthorFilter(ownerId, comments.authorUserId)))
	return commentRows.map(({ findingId }) => findingId)
}
