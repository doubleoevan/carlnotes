// the paid calls that no other row records. a row with a user bills that user, and a row with no user is the platform's
// own cost, which no user's budget and no plan's cutoff ever reads

import { sql } from "drizzle-orm"
import { check, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { primaryId } from "./columns"
import { podcastEpisodes } from "./podcast"
import { topics } from "./topics"
import { users } from "./users"

// what a spend paid for. the first three bill the user who asked: a url attachment's page fetch, a url Source's
// screening fetch, and a source suggestion's search. the others are the platform's: a platform-billed film's render
// minutes, generated chapter images, own image, animated picture, and animation plan, the topic memory backfill's model
// calls, and a text's moderation
const SPEND_KINDS = [
	"urlAttachmentFetch",
	"sourceScreenFetch",
	"sourceSuggestionSearch",
	"topicVideoRender",
	"topicVideoChapterImage",
	"topicVideoImage",
	"topicVideoAnimation",
	"topicVideoAnimationPlan",
	"topicMemoryBackfill",
	"textModeration",
] as const
export type SpendKind = (typeof SPEND_KINDS)[number]

export const spends = pgTable(
	"spends",
	{
		id: primaryId(),
		kind: text("kind", { enum: SPEND_KINDS }).notNull(),
		// the user the cost bills, or null for the platform's own cost
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		// the Topic and the podcast episode the call was made for, if it had one
		topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
		podcastEpisodeId: text("podcast_episode_id").references(() => podcastEpisodes.id, { onDelete: "set null" }),
		cost: doublePrecision("cost").notNull(),
		// when the cost was incurred, which the day's and the month's sums filter on
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("spends_created_idx").on(table.createdAt),
		index("spends_user_created_idx").on(table.userId, table.createdAt),
		check("spends_cost_nonnegative", sql`${table.cost} >= 0`),
	],
)
