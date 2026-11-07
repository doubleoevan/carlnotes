// the columns that store a social target on the reactions and the comments tables, and the filters and values built
// from them
import type { CommentTarget, SocialTarget, SocialTargetKind } from "@carlnotes/contracts/social"
import { comments, reactions } from "@carlnotes/db/schema/social"
import { eq, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

// the table column that stores each kind of social target. the comments table has every one but the comment's
const SOCIAL_TARGET_COLUMN_KEYS = {
	finding: "findingId",
	podcastEpisode: "podcastEpisodeId",
	topic: "topicId",
	post: "postId",
	comment: "commentId",
} as const satisfies Record<SocialTargetKind, string>

// the target columns of a comment row, and of a reaction row
type CommentTargetRow = {
	findingId: string | null
	podcastEpisodeId: string | null
	topicId: string | null
	postId: string | null
}
type ReactionTargetRow = CommentTargetRow & { commentId: string | null }

/**
 * Returns the column that stores a kind of social target on the reactions table.
 */
export function toReactionTargetColumn(kind: SocialTargetKind): AnyPgColumn {
	return reactions[SOCIAL_TARGET_COLUMN_KEYS[kind]]
}

/**
 * Returns the filter that matches the comments on one social target.
 */
export function toCommentTargetFilter(target: CommentTarget): SQL {
	return eq(comments[SOCIAL_TARGET_COLUMN_KEYS[target.kind]], target.id)
}

/**
 * Returns a social target as the column value an insert sets.
 */
export function toSocialTargetValues<Kind extends SocialTargetKind>(target: {
	kind: Kind
	id: string
}): Partial<Record<(typeof SOCIAL_TARGET_COLUMN_KEYS)[Kind], string>> {
	return { [SOCIAL_TARGET_COLUMN_KEYS[target.kind]]: target.id } as Partial<
		Record<(typeof SOCIAL_TARGET_COLUMN_KEYS)[Kind], string>
	>
}

/**
 * Returns the social target a comment row hangs on, from the one target column it sets.
 */
export function toRowCommentTarget(row: CommentTargetRow): CommentTarget {
	// the check constraint sets exactly one, so the first one set is the target
	if (row.findingId) {
		return { kind: "finding", id: row.findingId }
	}
	if (row.podcastEpisodeId) {
		return { kind: "podcastEpisode", id: row.podcastEpisodeId }
	}
	return row.topicId ? { kind: "topic", id: row.topicId } : { kind: "post", id: row.postId ?? "" }
}

/**
 * Returns the social target a reaction row hangs on: a Comment, or what a comment row hangs on.
 */
export function toRowSocialTarget(row: ReactionTargetRow): SocialTarget {
	return row.commentId ? { kind: "comment", id: row.commentId } : toRowCommentTarget(row)
}
