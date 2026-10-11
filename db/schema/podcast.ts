// the podcast tables: episodes, chapters, listens, and feed tokens
import type { PodcastEpisodeScript } from "@shared/contracts"
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core"
import { podcastEpisodeStatus, primaryId, rating, timestamps } from "./columns"
import { findings, resources, scans } from "./scans"
import { topics } from "./topics"
import { users } from "./users"

// one podcast episode of a topic, narrating the topic's findings as a two-speaker script
export const podcastEpisodes = pgTable(
	"episodes",
	{
		id: primaryId(),
		// the topic, cleared instead of being cascaded so that a deleted topic's podcast episodes keep their spend history
		topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
		// the user that the podcast episode bills, who is its scan's owner
		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the scan that started the podcast episode
		scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
		// the podcast episode status. recording until it publishes or fails, and removed once the topic's owner or an admin
		// removes it or a later short podcast episode replaces it. error holds a failure reason
		status: podcastEpisodeStatus("status").notNull().default("recording"),
		error: text("error"),
		// whether the podcast episode was planned as a short one, which a free plan's topic gets
		isShort: boolean("is_short").notNull().default(false),
		// the title and the description, written before any audio is recorded
		title: text("title"),
		description: text("description"),
		// the publish year and the episode number within that year, both assigned only on publish
		season: integer("season"),
		episodeNumber: integer("number"),
		// the stored audio's object key, its byte size, and its length in seconds
		audioKey: text("audio_key"),
		audioByteSize: integer("audio_byte_size"),
		durationSeconds: integer("duration_seconds"),
		// the speech model that recorded the podcast episode, and what the script and the speech cost in dollars
		model: text("model"),
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the script that passed its checks, and when the podcast episode published
		script: jsonb("script").$type<PodcastEpisodeScript>(),
		publishedAt: timestamp("published_at", { withTimezone: true }),
		// created and updated timestamps
		...timestamps(),
	},
	// one podcast episode per scan and one episode number per topic and season.
	// covers the topic's episode list and the monthly spend sum
	(table) => [
		uniqueIndex("episodes_scan_unique").on(table.scanId),
		uniqueIndex("episodes_topic_season_number_unique").on(table.topicId, table.season, table.episodeNumber),
		index("episodes_topic_published_idx").on(table.topicId, table.publishedAt),
		index("episodes_owner_created_idx").on(table.ownerId, table.createdAt),
	],
)

// one chapter of a published podcast episode. a chapter narrates one finding
export const podcastEpisodeChapters = pgTable(
	"episode_chapters",
	{
		id: primaryId(),
		// the podcast episode that the chapter belongs to
		podcastEpisodeId: text("episode_id")
			.notNull()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// the chapter's place in the podcast episode, from zero
		position: integer("position").notNull(),
		// the finding that the chapter narrates, cleared if a scan filters the finding out.
		// the resource stays after the finding is cleared
		findingId: text("finding_id").references(() => findings.id, { onDelete: "set null" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => resources.id, { onDelete: "cascade" }),
		// the chapter's own title and its finding's source url, which stay after the finding is filtered out
		title: text("title").notNull(),
		sourceUrl: text("source_url").notNull(),
		// a user's rating of a chapter whose finding was filtered out. the topic's next finding of the resource takes the rating
		rating: rating("rating"),
		// where the chapter starts and ends in the audio, in seconds
		startSeconds: real("start_seconds").notNull(),
		endSeconds: real("end_seconds").notNull(),
	},
	// one chapter per position. the resource and finding indexes serve the deletes of a resource or a finding
	(table) => [
		uniqueIndex("episode_chapters_episode_position_unique").on(table.podcastEpisodeId, table.position),
		index("episode_chapters_resource_id_idx").on(table.resourceId),
		index("episode_chapters_finding_id_idx").on(table.findingId),
	],
)

// one user's plays, progress, and completion of one podcast episode
export const podcastEpisodeListens = pgTable(
	"episode_listens",
	{
		id: primaryId(),
		// the podcast episode and the user
		podcastEpisodeId: text("episode_id")
			.notNull()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// how many times the user started or downloaded the podcast episode, how far playback got,
		// and when playback reached the end
		playCount: integer("play_count").notNull().default(0),
		progressSeconds: integer("progress_seconds").notNull().default(0),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		// created and updated timestamps
		...timestamps(),
	},
	// one row per listener and podcast episode. covers the read of a listener's unplayed episodes
	(table) => [
		uniqueIndex("episode_listens_episode_user_unique").on(table.podcastEpisodeId, table.userId),
		index("episode_listens_user_id_idx").on(table.userId),
	],
)

// one listener's podcast feed token for one private or invite topic
export const podcastFeedTokens = pgTable(
	"episode_feed_tokens",
	{
		id: primaryId(),
		// the topic and the user
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the random value in the listener's feed url, which alone authorizes a request
		token: text("token").notNull(),
		// when a podcast app first fetched the feed. null until then
		firstFetchedAt: timestamp("first_fetched_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one token per listener and topic. the unique token index covers the lookup by a feed url's token
	(table) => [
		uniqueIndex("episode_feed_tokens_token_unique").on(table.token),
		uniqueIndex("episode_feed_tokens_topic_user_unique").on(table.topicId, table.userId),
	],
)
