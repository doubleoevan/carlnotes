// the job_leases table, which keeps a job that must not overlap itself to one run at a time
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

// one job's lease: which run holds the lease, when it took the lease, and when the lease expires unless renewed
export const jobLeases = pgTable("job_leases", {
	name: text("name").primaryKey(),
	holderId: text("holder_id").notNull(),
	takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})
