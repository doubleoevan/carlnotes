// the saved counters behind a topic's viewer count and a podcast episode's listener count
import { sql } from "drizzle-orm"
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bytea, primaryId } from "./columns"
import { podcastEpisodes } from "./podcast"
import { topics } from "./topics"

// one saved Redis HyperLogLog counter per topic or podcast episode
export const viewerCounters = pgTable(
	"viewer_counters",
	{
		id: primaryId(),
		// the topic or the podcast episode the counter counts, exactly one of the two
		topicId: text("topic_id")
			.unique()
			.references(() => topics.id, { onDelete: "cascade" }),
		podcastEpisodeId: text("episode_id")
			.unique()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		// the counter's bytes as Redis stores them, and when the sync last saved them
		counter: bytea("counter").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		check("viewer_counters_ref_shape", sql`(${table.topicId} is not null) <> (${table.podcastEpisodeId} is not null)`),
	],
)
