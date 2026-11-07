// the social tables: reactions, comments, the users a comment mentions, and the links of a comment shared with the
// podcast
import { sql } from "drizzle-orm"
import {
	type AnyPgColumn,
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core"
import { primaryId, reactionType, timestamps } from "./columns"
import { podcastEpisodes } from "./podcast"
import { findings } from "./scans"
import { topics } from "./topics"
import { users } from "./users"

// the social target columns that reactions and comments share. deleting the Finding, the Podcast Episode, or the
// Topic takes the row with it. a post has no table yet, so its column references nothing
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column builder types are generated, and naming them here would break on an upgrade
function socialTargetColumns() {
	return {
		findingId: text("finding_id").references(() => findings.id, { onDelete: "cascade" }),
		podcastEpisodeId: text("podcast_episode_id").references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		postId: text("post_id"),
	}
}

// one user's positive response to a social target, by its type. one row per user per social target
export const reactions = pgTable(
	"reactions",
	{
		id: primaryId(),
		// who reacted. closing the account takes the reaction with it
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		...socialTargetColumns(),
		// the Comment it reacts to, which takes the reaction with it
		commentId: text("comment_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
		reactionType: reactionType("reaction_type").notNull(),
		...timestamps(),
	},
	(table) => [
		// exactly one social target
		check(
			"reactions_one_social_target",
			sql`num_nonnulls(${table.findingId}, ${table.podcastEpisodeId}, ${table.topicId}, ${table.postId}, ${table.commentId}) = 1`,
		),
		// one reaction per user per social target, which a save's upsert names
		uniqueIndex("reactions_user_finding_unique")
			.on(table.userId, table.findingId)
			.where(sql`${table.findingId} is not null`),
		uniqueIndex("reactions_user_podcast_episode_unique")
			.on(table.userId, table.podcastEpisodeId)
			.where(sql`${table.podcastEpisodeId} is not null`),
		uniqueIndex("reactions_user_topic_unique").on(table.userId, table.topicId).where(sql`${table.topicId} is not null`),
		uniqueIndex("reactions_user_post_unique").on(table.userId, table.postId).where(sql`${table.postId} is not null`),
		uniqueIndex("reactions_user_comment_unique")
			.on(table.userId, table.commentId)
			.where(sql`${table.commentId} is not null`),
		// a social target's reactions, for its counts
		index("reactions_finding_created_at_idx")
			.on(table.findingId, table.createdAt)
			.where(sql`${table.findingId} is not null`),
		index("reactions_podcast_episode_created_at_idx")
			.on(table.podcastEpisodeId, table.createdAt)
			.where(sql`${table.podcastEpisodeId} is not null`),
		index("reactions_topic_created_at_idx").on(table.topicId, table.createdAt).where(sql`${table.topicId} is not null`),
		index("reactions_post_created_at_idx").on(table.postId, table.createdAt).where(sql`${table.postId} is not null`),
		index("reactions_comment_idx").on(table.commentId).where(sql`${table.commentId} is not null`),
		// the day's reactions, which the notifications email reads
		index("reactions_created_at_idx").on(table.createdAt),
		index("reactions_user_id_idx").on(table.userId),
	],
)

// one comment in a social target's thread, plain text
export const comments = pgTable(
	"comments",
	{
		id: primaryId(),
		// who wrote it, null for Carl. closing the account takes the comment with it
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "cascade" }),
		...socialTargetColumns(),
		// the chapter of its Podcast Episode that it names, by position
		chapterPosition: integer("chapter_position"),
		// the top-level comment a reply answers, on the same social target. the thread shows one level
		parentCommentId: text("parent_comment_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
		body: text("body").notNull(),
		// when a Topic editor shared it with the podcast, and the Topic its social target belongs to. both are set together
		sharedWithPodcastAt: timestamp("shared_with_podcast_at", { withTimezone: true }),
		sharedWithPodcastTopicId: text("shared_with_podcast_topic_id").references(() => topics.id, { onDelete: "cascade" }),
		// the Podcast Episode whose script read it, which frees its shared comment slot
		airedPodcastEpisodeId: text("aired_podcast_episode_id").references(() => podcastEpisodes.id, {
			onDelete: "set null",
		}),
		...timestamps(),
	},
	(table) => [
		// exactly one social target, a chapter only on a Podcast Episode, and a shared time with its Topic
		check(
			"comments_one_social_target",
			sql`num_nonnulls(${table.findingId}, ${table.podcastEpisodeId}, ${table.topicId}, ${table.postId}) = 1`,
		),
		check(
			"comments_chapter_on_podcast_episode",
			sql`${table.chapterPosition} is null or ${table.podcastEpisodeId} is not null`,
		),
		check(
			"comments_shared_with_podcast_topic",
			sql`(${table.sharedWithPodcastAt} is null) = (${table.sharedWithPodcastTopicId} is null)`,
		),
		// a social target's thread newest first
		index("comments_finding_created_at_idx")
			.on(table.findingId, table.createdAt)
			.where(sql`${table.findingId} is not null`),
		index("comments_podcast_episode_created_at_idx")
			.on(table.podcastEpisodeId, table.createdAt)
			.where(sql`${table.podcastEpisodeId} is not null`),
		index("comments_topic_created_at_idx").on(table.topicId, table.createdAt).where(sql`${table.topicId} is not null`),
		index("comments_post_created_at_idx").on(table.postId, table.createdAt).where(sql`${table.postId} is not null`),
		// the day's comments, which the notifications email reads
		index("comments_created_at_idx").on(table.createdAt),
		index("comments_author_user_id_idx").on(table.authorUserId),
		index("comments_aired_podcast_episode_idx")
			.on(table.airedPodcastEpisodeId)
			.where(sql`${table.airedPodcastEpisodeId} is not null`),
		// a comment's replies oldest first, and a Topic's shared comments by when they were shared
		index("comments_parent_created_at_idx")
			.on(table.parentCommentId, table.createdAt)
			.where(sql`${table.parentCommentId} is not null`),
		index("comments_shared_with_podcast_topic_idx")
			.on(table.sharedWithPodcastTopicId, table.sharedWithPodcastAt)
			.where(sql`${table.sharedWithPodcastTopicId} is not null`),
	],
)

// one user a comment mentions, with the name as the body wrote it, so a later rename never moves the link
export const commentMentions = pgTable(
	"comment_mentions",
	{
		commentId: text("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
		mentionedUserId: text("mentioned_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		username: text("username").notNull(),
	},
	// one row per comment and user, and the mentions of one user, which the notifications email reads
	(table) => [
		primaryKey({ columns: [table.commentId, table.mentionedUserId] }),
		index("comment_mentions_mentioned_user_id_idx").on(table.mentionedUserId),
	],
)

// one url in the body of a comment shared with the podcast, which the Topic's next Scan reviews like a Personal sources
// link
export const commentLinks = pgTable(
	"comment_links",
	{
		id: primaryId(),
		commentId: text("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		// when a Scan reviewed it. null while it waits
		consideredAt: timestamp("considered_at", { withTimezone: true }),
	},
	// one row per comment and url, and a Topic's waiting links
	(table) => [
		uniqueIndex("comment_links_comment_url_unique").on(table.commentId, table.url),
		index("comment_links_topic_pending_idx").on(table.topicId).where(sql`${table.consideredAt} is null`),
	],
)
