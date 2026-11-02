// the topics shared into a team beyond its owning team
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { teams } from "./teams"
import { topics } from "./topics"

// the additional teams a topic is shared into. the owning team lives on topics.team_id alone
export const teamTopics = pgTable(
	"team_topics",
	{
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.teamId, table.topicId] }),
		// the topic side covers "which teams hold this topic"
		index("team_topics_topic_id_idx").on(table.topicId),
	],
)
