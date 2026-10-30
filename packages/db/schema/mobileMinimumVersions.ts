// the mobile minimum versions table: the oldest app version each platform's api still serves
import { MOBILE_PLATFORMS } from "@carlnotes/contracts/clientTelemetry"
import { sql } from "drizzle-orm"
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

// the platforms as the check constraint lists them
const platformList = sql.raw(MOBILE_PLATFORMS.map((platform) => `'${platform}'`).join(", "))

// one row per platform. a platform with no row has no minimum
export const mobileMinimumVersions = pgTable(
	"mobile_minimum_versions",
	{
		platform: text("platform").primaryKey(),
		minimumVersion: text("minimum_version").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		// the admin who saved the row, kept as null once their account closes
		updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
	},
	// the two platforms the app ships on
	(table) => [check("mobile_minimum_versions_platform_check", sql`${table.platform} in (${platformList})`)],
)
