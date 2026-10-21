// the object storage tables: a host's favicon, and the pending object deletions
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

// a host's favicon, fetched once when review reads a page on the host and shown wherever the host is named
export const favicons = pgTable("favicons", {
	// the host the icon belongs to, as the feed names it
	host: text("host").primaryKey(),
	// where the stored icon lives in object storage and its type, both null until a fetch stores one
	objectKey: text("object_key"),
	contentType: text("content_type"),
	// the url the stored icon came from, so a wrong icon says where it was taken from
	sourceUrl: text("source_url"),
	// when the icon was fetched. a row older than a month is fetched again the next time a page on the host is read
	fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
})

// the pending object deletions table. a stored object key still to delete
export const pendingObjectDeletions = pgTable(
	"pending_object_deletions",
	{
		objectKey: text("object_key").primaryKey(),
		// when the key was recorded, and when the sweep may first try it
		recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
		nextTryAt: timestamp("next_try_at", { withTimezone: true }).defaultNow().notNull(),
		// how many deletes failed, and the last failure
		attemptCount: integer("attempt_count").notNull().default(0),
		lastError: text("last_error"),
		// when the key was reported as pending for over a day
		reportedAt: timestamp("reported_at", { withTimezone: true }),
	},
	// covers the read of the keys whose try time has passed
	(table) => [index("pending_object_deletions_next_try_at_idx").on(table.nextTryAt)],
)
