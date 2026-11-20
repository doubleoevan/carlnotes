// the notifications emails sent and the quiet days recorded, one row per user per day
import { boolean, date, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

// one day's notifications email to a user, or the record that the day had nothing to send them. an email's row is
// written before the send, so a second sweep that day sends nothing, and a quiet day's row keeps every later sweep of
// the day from reading the user again
export const notificationsEmailSends = pgTable(
	"notifications_email_sends",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the UTC day the email was sent on, or the quiet day
		sentDay: date("sent_day").notNull(),
		// the end of the time this email covered, where the next one starts. on a quiet day's row, the time of the check
		activityEndAt: timestamp("activity_end_at", { withTimezone: true }).notNull(),
		// whether the row records a quiet day, which is not an email
		isQuiet: boolean("is_quiet").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.sentDay] })],
)
