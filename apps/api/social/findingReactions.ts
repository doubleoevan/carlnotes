// a feed's reaction summaries, each Finding's and its page's own, and each Finding's comment count
import {
	EMPTY_REACTION_SUMMARY,
	type ReactionSummary,
	type SocialTarget,
	toSocialTargetKey,
} from "@carlnotes/contracts/social"
import { loadFindingCommentCounts } from "./commentRows"
import { loadReactionSummaries } from "./reactionRows"

// a feed's Findings, the user who reads them, null for a visitor, and the page's own social target if the read is a
// page's
type AttachReactionSummariesOptions = {
	topicFindings: { findingId: string; reactions?: ReactionSummary; commentCount?: number }[]
	userId: string | null
	pageSocialTarget?: SocialTarget
	// other targets on the page whose reactions load in the same read, like the cards of the topic's films
	extraSocialTargets?: SocialTarget[]
}

// the page's own summary if the read named its social target, and every target's summary that the read found
type AttachedReactionSummaries = {
	pageReactions: ReactionSummary | undefined
	reactionSummaryByTarget: Map<string, ReactionSummary>
}

/**
 * Attaches each Finding's reaction summary and comment count to a feed's Findings, and returns the page's own summary
 * if the read names the page's social target, beside every target's summary. Each loads in one read however many
 * Findings there are.
 */
export async function attachReactionSummaries({
	topicFindings,
	userId,
	pageSocialTarget,
	extraSocialTargets = [],
}: AttachReactionSummariesOptions): Promise<AttachedReactionSummaries> {
	// one read of every Finding's reactions, the page's own, and the extra targets', and one of every Finding's comment
	// count
	const findingTargets = topicFindings.map((topicFinding) => ({ kind: "finding" as const, id: topicFinding.findingId }))
	const pageTargets = pageSocialTarget ? [pageSocialTarget] : []
	const [reactionSummaries, commentCounts] = await Promise.all([
		loadReactionSummaries({ userId, targets: [...findingTargets, ...pageTargets, ...extraSocialTargets] }),
		loadFindingCommentCounts({ findingIds: findingTargets.map(({ id }) => id), userId }),
	])

	// each Finding takes its own summary or the empty one, and its own count or none
	for (const topicFinding of topicFindings) {
		const findingKey = toSocialTargetKey({ kind: "finding", id: topicFinding.findingId })
		topicFinding.reactions = reactionSummaries.get(findingKey) ?? EMPTY_REACTION_SUMMARY
		topicFinding.commentCount = commentCounts.get(topicFinding.findingId) ?? 0
	}

	// the page's own summary, for a read that named its social target, and every target's
	const pageReactions = pageSocialTarget
		? (reactionSummaries.get(toSocialTargetKey(pageSocialTarget)) ?? EMPTY_REACTION_SUMMARY)
		: undefined
	return { pageReactions, reactionSummaryByTarget: reactionSummaries }
}
