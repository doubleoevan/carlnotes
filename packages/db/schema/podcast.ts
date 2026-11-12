// the podcast tables: episodes, chapters, listens, feed tokens, films, and the film section's saved state
import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { sql } from "drizzle-orm"
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
import {
	podcastEpisodeStatus,
	primaryId,
	rating,
	timestamps,
	topicImageOrigin,
	topicPodcastEpisodeVideoStatus,
} from "./columns"
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
		// the unique people who played or downloaded the podcast episode, all time
		listenerCount: integer("listener_count").notNull().default(0),
		// an admin can pin this podcast episode to the home page and set its order. the column kept its old name
		// through the rename to home order
		homeOrder: integer("feature_order"),
		// the topic's owner can pin this podcast episode to the top of their profile page and set its order
		profileOrder: integer("profile_order"),
		// the content hash of the podcast episode's own image, drawn once it publishes, or null until it is drawn
		imageHash: text("image_hash"),
		// where the image came from, null for a drawn image from before uploads, and the editor's image prompt that the
		// last render followed, null for the house style and an upload
		imageOrigin: topicImageOrigin("image_origin"),
		imagePrompt: text("image_prompt"),
		// the speech model that recorded the podcast episode, and what the script, the speech, and the image cost in dollars
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
		// the few pinned podcast episodes, which the home's home topic and podcast cards and the admin console read
		index("episodes_feature_order_idx").on(table.homeOrder).where(sql`${table.homeOrder} is not null`),
		// the few podcast episodes pinned to a profile page
		index("episodes_profile_order_idx").on(table.profileOrder).where(sql`${table.profileOrder} is not null`),
		index("episodes_owner_created_idx").on(table.ownerId, table.createdAt),
		// the trigram indexes behind the episode search, which matches anywhere in the lowercased title or description
		index("episodes_title_lower_trgm").using("gin", sql`lower(${table.title}) gin_trgm_ops`),
		index("episodes_description_lower_trgm").using("gin", sql`lower(${table.description}) gin_trgm_ops`),
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
		// how many times the user started or downloaded the podcast episode in either format, how far playback got,
		// and when playback reached the end
		playCount: integer("play_count").notNull().default(0),
		// how many of those plays were of the film
		videoPlayCount: integer("video_play_count").notNull().default(0),
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

// the film of one podcast episode: its stored parts, the joined film, and its captions
export const topicPodcastEpisodeVideos = pgTable(
	"topic_podcast_episode_videos",
	{
		id: primaryId(),
		// the podcast episode, which has at most one film
		podcastEpisodeId: text("episode_id")
			.notNull()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// the film status. rendering until it is ready or fails, and error holds a failure reason
		status: topicPodcastEpisodeVideoStatus("status").notNull().default("rendering"),
		error: text("error"),
		// the object keys of the intro, the chapters, and the sign-off parts, all video only
		introKey: text("intro_key"),
		chaptersKey: text("chapters_key"),
		signOffKey: text("sign_off_key"),
		// the object keys of the joined film that plays and of its WebVTT captions
		filmKey: text("film_key"),
		captionsKey: text("captions_key"),
		// the joined film's byte size and its length in seconds
		byteSize: integer("byte_size"),
		durationSeconds: integer("duration_seconds"),
		// the content hash of the image that the intro and the sign-off were drawn from
		renderedImageHash: text("rendered_image_hash"),
		// the render version the stored film was rendered at, and the version whose re-render failed for good, null if
		// none did. a film from before render versions is at version 1
		renderVersion: integer("render_version").notNull().default(1),
		failedRenderVersion: integer("failed_render_version"),
		// the content hash of the film's own image, which its intro, sign-off, and poster show. null until it is drawn,
		// and the film shows the podcast episode's image until then
		imageHash: text("image_hash"),
		// where the film's image came from, and the editor's image prompt that the last render followed, null for the
		// house style and an upload
		imageOrigin: topicImageOrigin("image_origin"),
		imagePrompt: text("image_prompt"),
		// what the render and every rebuild cost in dollars
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// an admin can pin this film to the home's Featured films and set its order
		homeOrder: integer("home_order"),
		// the Topic's owner can pin this film to their Café's Featured Films and set its order
		profileOrder: integer("profile_order"),
		// created and updated timestamps
		...timestamps(),
	},
	// one film per podcast episode. the partial index covers the few films pinned to the home
	(table) => [
		uniqueIndex("topic_podcast_episode_videos_episode_unique").on(table.podcastEpisodeId),
		index("topic_podcast_episode_videos_home_order_idx").on(table.homeOrder).where(sql`${table.homeOrder} is not null`),
	],
)

// a user's open or closed choice for one topic's Topic Cinema section
export const topicPodcastEpisodeVideoSections = pgTable(
	"topic_podcast_episode_video_sections",
	{
		id: primaryId(),
		// the user and the topic
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// whether the user left the section open
		isOpen: boolean("is_open").notNull(),
		// the topic's latest film when the user chose. a newer film makes the choice stale
		podcastEpisodeId: text("episode_id")
			.notNull()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// created and updated timestamps
		...timestamps(),
	},
	// one choice per user and topic. the topic index serves a topic's delete, and the podcast episode index a podcast
	// episode's delete
	(table) => [
		uniqueIndex("topic_podcast_episode_video_sections_user_topic_unique").on(table.userId, table.topicId),
		index("topic_podcast_episode_video_sections_topic_id_idx").on(table.topicId),
		index("topic_podcast_episode_video_sections_episode_id_idx").on(table.podcastEpisodeId),
	],
)
