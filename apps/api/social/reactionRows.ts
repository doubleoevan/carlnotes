// the reaction reads: the summary of one social target, and the summaries of many in one read
import {
	EMPTY_REACTION_SUMMARY,
	REACTION_USER_PREVIEW_COUNT,
	type ReactionSummary,
	type SocialTarget,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { toVisibleAuthorFilter } from "@carlnotes/db/contentFilters"
import { reactions } from "@carlnotes/db/schema/social"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, inArray, lte, or, type SQL, sql } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { socialAuthorColumns } from "./socialRows"
import { toReactionTargetColumn, toRowSocialTarget } from "./socialTargetColumns"

// the social target columns
const reactionTargetColumns = {
	findingId: reactions.findingId,
	podcastEpisodeId: reactions.podcastEpisodeId,
	topicId: reactions.topicId,
	postId: reactions.postId,
	commentId: reactions.commentId,
}

// the columns that group a social target's reactions of one type
const reactionTypeGroup = sql.join([...Object.values(reactionTargetColumns), reactions.reactionType], sql`, `)

// the user who reads, null for a visitor, and the social targets to summarize
type LoadReactionSummariesOptions = { userId: string | null; targets: SocialTarget[] }

/**
 * Loads the reaction summary of each social target, by its key, in one read however many targets and kinds there
 * are. A social target with no reactions has no entry. Each count names its newest users. Counts leave out an author
 * hidden from the user.
 */
export async function loadReactionSummaries({
	userId,
	targets,
}: LoadReactionSummariesOptions): Promise<Map<string, ReactionSummary>> {
	if (targets.length === 0) {
		return new Map()
	}

	// rank each type's reactions on each target newest first, each with the type's count and whether the user chose it
	const isOwnReaction = userId ? sql`bool_or(${reactions.userId} = ${userId})` : sql`bool_or(false)`
	const rankedReactions = db
		.select({
			...reactionTargetColumns,
			reactionType: reactions.reactionType,
			authorUserId: reactions.userId,
			position:
				sql<number>`row_number() over (partition by ${reactionTypeGroup} order by ${reactions.createdAt} desc)`.as(
					"position",
				),
			typeCount: sql<number>`count(*) over (partition by ${reactionTypeGroup})`.mapWith(Number).as("type_count"),
			isOwn: sql<boolean>`${isOwnReaction} over (partition by ${reactionTypeGroup})`.as("is_own"),
		})
		.from(reactions)
		.where(and(toSocialTargetsFilter(targets), toVisibleAuthorFilter(userId, reactions.userId)))
		.as("ranked_reactions")

	// only each type's newest few read a user's name
	const newestReactionRows = await db
		.select({
			findingId: rankedReactions.findingId,
			podcastEpisodeId: rankedReactions.podcastEpisodeId,
			topicId: rankedReactions.topicId,
			postId: rankedReactions.postId,
			commentId: rankedReactions.commentId,
			reactionType: rankedReactions.reactionType,
			authorUserId: rankedReactions.authorUserId,
			typeCount: rankedReactions.typeCount,
			isOwn: rankedReactions.isOwn,
			...socialAuthorColumns,
		})
		.from(rankedReactions)
		.innerJoin(users, eq(users.id, rankedReactions.authorUserId))
		.where(lte(rankedReactions.position, REACTION_USER_PREVIEW_COUNT))
		.orderBy(rankedReactions.position)

	// collect each target's counts, each with its users, and the user's own type
	const reactionSummaries = new Map<string, ReactionSummary>()
	for (const { reactionType, authorUserId, typeCount, isOwn, ...row } of newestReactionRows) {
		const { username, avatarSource, avatarKey, ...targetRow } = row
		const targetKey = toSocialTargetKey(toRowSocialTarget(targetRow))
		const reactionSummary = reactionSummaries.get(targetKey) ?? { counts: [], ownReactionType: null }
		reactionSummaries.set(targetKey, reactionSummary)

		// the type's count, added by the first of its rows
		let reactionCount = reactionSummary.counts.find((candidate) => candidate.reactionType === reactionType)
		if (!reactionCount) {
			reactionCount = { reactionType, count: typeCount, users: [] }
			reactionSummary.counts.push(reactionCount)
		}

		// a user with no username stays counted and goes unnamed
		const reactionUser = toProfileIdentity({ userId: authorUserId, username, avatarSource, avatarKey })
		if (reactionUser) {
			reactionCount.users.push(reactionUser)
		}

		// the type the user chose
		if (isOwn) {
			reactionSummary.ownReactionType = reactionType
		}
	}

	return reactionSummaries
}

/**
 * Loads one social target's reaction summary.
 */
export async function loadReactionSummary(userId: string | null, target: SocialTarget): Promise<ReactionSummary> {
	const reactionSummaries = await loadReactionSummaries({ userId, targets: [target] })
	return reactionSummaries.get(toSocialTargetKey(target)) ?? EMPTY_REACTION_SUMMARY
}

// the filter that matches the reactions on any of the social targets, one clause per kind
function toSocialTargetsFilter(targets: SocialTarget[]): SQL {
	// the caller passes at least one target, so the filter is never empty
	const targetsByKind = Map.groupBy(targets, (target) => target.kind)
	return or(
		...[...targetsByKind].map(([kind, kindTargets]) =>
			inArray(
				toReactionTargetColumn(kind),
				kindTargets.map((target) => target.id),
			),
		),
	) as SQL
}
