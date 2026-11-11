// the topic image tables: the one image each topic carries, and the render rows that charge for it

import { sql } from "drizzle-orm"
import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { primaryId, timestamps, topicImageOrigin, topicImageRenderKind, topicImageRenderStatus } from "./columns"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "./podcast"
import { topicPosts } from "./topicPosts"
import { topics } from "./topics"
import { users } from "./users"

// a topic's current image: the content hash its files are stored under, where it came from, and what drew it
export const topicImages = pgTable("topic_images", {
	topicId: text("topic_id")
		.primaryKey()
		.references(() => topics.id, { onDelete: "cascade" }),
	// the sha256 of the original's bytes, which names the storage folder and every url
	hash: text("hash").notNull(),
	origin: topicImageOrigin("origin").notNull(),
	// the scene the writer returned and the model that drew it, both null for an upload
	scene: text("scene"),
	model: text("model"),
	// the owner's image prompt that the render followed, null for the house style and an upload
	imagePrompt: text("image_prompt"),
	// the original's pixel size
	width: integer("width").notNull(),
	height: integer("height").notNull(),
	// created and updated timestamps
	...timestamps(),
})

// one model call for a topic's image, which the monthly spend sums and the regeneration count counts
export const topicImageRenders = pgTable(
	"topic_image_renders",
	{
		id: primaryId(),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the podcast episode whose image the render draws, null for the topic's own image
		podcastEpisodeId: text("podcast_episode_id").references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// the topic post whose image the render draws, null for the topic's own image and a podcast episode's
		topicPostId: text("topic_post_id").references(() => topicPosts.id, { onDelete: "cascade" }),
		// the film whose image the render draws, null for every other image
		topicPodcastEpisodeVideoId: text("topic_podcast_episode_video_id").references(() => topicPodcastEpisodeVideos.id, {
			onDelete: "cascade",
		}),
		// the user the render bills, null for a render on the platform key
		userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
		kind: topicImageRenderKind("kind").notNull(),
		status: topicImageRenderStatus("status").notNull().default("pending"),
		// the model that drew it, null for a resize pass, and what the call cost in dollars
		model: text("model"),
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the scene the writer returned, written once the writer runs. the owner's hint is never stored
		scene: text("scene"),
		// why a failed render failed
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	// covers the regeneration count and the monthly spend sum, a topic's render history, and the renders that a
	// Topic Post's delete and a film's delete take with them
	(table) => [
		index("topic_image_renders_user_kind_created_idx").on(table.userId, table.kind, table.createdAt),
		index("topic_image_renders_topic_created_idx").on(table.topicId, table.createdAt),
		index("topic_image_renders_topic_post_id_idx").on(table.topicPostId).where(sql`${table.topicPostId} is not null`),
		index("topic_image_renders_topic_podcast_episode_video_id_idx")
			.on(table.topicPodcastEpisodeVideoId)
			.where(sql`${table.topicPodcastEpisodeVideoId} is not null`),
	],
)
