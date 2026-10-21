// the claims table, which keeps a job that must not overlap itself to one run at a time
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

// one claim's lease: which run holds the claim, when it took the claim, and when the lease expires unless renewed
export const claims = pgTable("claims", {
	name: text("name").primaryKey(),
	holderId: text("holder_id").notNull(),
	takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
