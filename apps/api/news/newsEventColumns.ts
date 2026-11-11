// the one set of columns every kind of news row selects, in one order and under one set of names, so the six reads
// union together

import { type NewsEventKind, newsEventKinds } from "@carlnotes/contracts/news"
import type { ReactionType } from "@carlnotes/contracts/social"
import { comments } from "@carlnotes/db/schema/social"
import { topics } from "@carlnotes/db/schema/topics"
import { type SQLWrapper, sql } from "drizzle-orm"

// a column no arm fills, by its type
const NULL_TEXT = sql<string | null>`null::text`
const NULL_INTEGER = sql<number | null>`null::integer`

// what one kind of row selects. a column it leaves out reads as null
type NewsEventColumnOptions = {
	kind: NewsEventKind
	id: SQLWrapper
	occurredAt: SQLWrapper
	// who did it, the row's title and text, and a reaction's type or count
	actorUserId?: SQLWrapper
	actorUsername?: SQLWrapper
	title?: SQLWrapper
	body?: SQLWrapper
	reactionType?: SQLWrapper
	reactionCount?: SQLWrapper
	// what the row's link opens
	findingId?: SQLWrapper
	season?: SQLWrapper
	episodeNumber?: SQLWrapper
	topicPostId?: SQLWrapper
	commentId?: SQLWrapper
	commentAuthorUserId?: SQLWrapper
	commentAuthorUsername?: SQLWrapper
	// the image's hash of the Topic Post a row publishes
	topicPostImageHash?: SQLWrapper
	// the Podcast Episode the row is about, with its own image's hash and how many people listened to it
	podcastEpisodeId?: SQLWrapper
	podcastEpisodeImageHash?: SQLWrapper
	listenerCount?: SQLWrapper
}

/**
 * Returns the columns one kind of news row selects, in one order and under one set of names, with the row's Topic.
 */
// biome-ignore lint/nursery/useExplicitReturnType: the union needs each column's generated type, and naming them here would break on an upgrade
export function toNewsEventColumns({
	kind,
	id,
	occurredAt,
	// a column the kind leaves out reads as null
	actorUserId = NULL_TEXT,
	actorUsername = NULL_TEXT,
	title = NULL_TEXT,
	body = NULL_TEXT,
	reactionType = NULL_TEXT,
	reactionCount = NULL_INTEGER,
	// the link's columns, null unless the kind opens them
	findingId = NULL_TEXT,
	season = NULL_INTEGER,
	episodeNumber = NULL_INTEGER,
	topicPostId = NULL_TEXT,
	commentId = NULL_TEXT,
	commentAuthorUserId = NULL_TEXT,
	commentAuthorUsername = NULL_TEXT,
	// the published Topic Post's image, and the Podcast Episode's columns, null unless the row is about one
	topicPostImageHash = NULL_TEXT,
	podcastEpisodeId = NULL_TEXT,
	podcastEpisodeImageHash = NULL_TEXT,
	listenerCount = NULL_INTEGER,
}: NewsEventColumnOptions) {
	return {
		// the kind and its place among rows of one time
		kind: sql<NewsEventKind>`${sql.raw(`'${kind}'`)}::text`.as("kind"),
		kindRank: sql<number>`${sql.raw(String(newsEventKinds.indexOf(kind)))}::integer`.as("kind_rank"),
		id: sql<string>`${id}`.as("id"),
		occurredAt: sql<Date>`${occurredAt}`.mapWith(comments.createdAt).as("occurred_at"),
		topicId: sql<string>`${topics.id}`.as("topic_id"),
		topicName: sql<string>`${topics.name}`.as("topic_name"),
		// who did it, the row's title and text, and a reaction's type or count
		actorUserId: sql<string | null>`${actorUserId}`.as("actor_user_id"),
		actorUsername: sql<string | null>`${actorUsername}`.as("actor_username"),
		title: sql<string | null>`${title}`.as("title"),
		body: sql<string | null>`${body}`.as("body"),
		reactionType: sql<ReactionType | null>`${reactionType}::text`.as("reaction_type"),
		reactionCount: sql<number | null>`${reactionCount}::integer`.as("reaction_count"),
		// what the row's link opens
		findingId: sql<string | null>`${findingId}`.as("finding_id"),
		season: sql<number | null>`${season}`.as("season"),
		episodeNumber: sql<number | null>`${episodeNumber}`.as("episode_number"),
		topicPostId: sql<string | null>`${topicPostId}`.as("topic_post_id"),
		commentId: sql<string | null>`${commentId}`.as("comment_id"),
		commentAuthorUserId: sql<string | null>`${commentAuthorUserId}`.as("comment_author_user_id"),
		commentAuthorUsername: sql<string | null>`${commentAuthorUsername}`.as("comment_author_username"),
		// the image the row shows: its Podcast Episode's or its published Topic Post's own, or its Topic's
		topicImageHash: sql<string | null>`${topics.imageHash}`.as("topic_image_hash"),
		topicPostImageHash: sql<string | null>`${topicPostImageHash}`.as("topic_post_image_hash"),
		podcastEpisodeId: sql<string | null>`${podcastEpisodeId}`.as("podcast_episode_id"),
		podcastEpisodeImageHash: sql<string | null>`${podcastEpisodeImageHash}`.as("podcast_episode_image_hash"),
		listenerCount: sql<number | null>`${listenerCount}`.as("listener_count"),
	}
}
