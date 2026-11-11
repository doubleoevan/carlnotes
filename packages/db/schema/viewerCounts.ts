// the saved counters behind the viewer counts of a topic, a profile, and a team, and a podcast episode's listener count
import { sql } from "drizzle-orm"
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bytea, primaryId } from "./columns"
import { podcastEpisodes } from "./podcast"
import { teams } from "./teams"
import { topics } from "./topics"
import { users } from "./users"

// one saved Redis HyperLogLog counter per topic, podcast episode, profile, or team
export const viewerCounters = pgTable(
	"viewer_counters",
	{
		id: primaryId(),
		// the topic, the podcast episode, the user whose profile it is, or the team the counter counts, exactly one of
		// the four
		topicId: text("topic_id")
			.unique()
			.references(() => topics.id, { onDelete: "cascade" }),
		podcastEpisodeId: text("episode_id")
			.unique()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		profileUserId: text("profile_user_id")
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.unique()
			.references(() => teams.id, { onDelete: "cascade" }),
		// the counter's bytes as Redis stores them, and when the sync last saved them
		counter: bytea("counter").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		check(
			"viewer_counters_ref_shape",
			sql`num_nonnulls(${table.topicId}, ${table.podcastEpisodeId}, ${table.profileUserId}, ${table.teamId}) = 1`,
		),
	],
)
