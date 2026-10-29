// the user blocks table: who blocked whom
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

// one block. the blocker stops seeing what the blocked user writes to them, and either account closing removes it
export const userBlocks = pgTable(
	"user_blocks",
	{
		blockerUserId: text("blocker_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		blockedUserId: text("blocked_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one row per pair, and the blocked side's index
	(table) => [
		primaryKey({ columns: [table.blockerUserId, table.blockedUserId] }),
		index("user_blocks_blocked_user_id_idx").on(table.blockedUserId),
	],
)
