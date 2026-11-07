// the notifications emails sent, one per user per day
import { date, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

// one day's notifications email to a user. the row is written before the send, so a second sweep that day sends nothing
export const notificationsEmailSends = pgTable(
	"notifications_email_sends",
	{
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the UTC day the email was sent on
		sentDay: date("sent_day").notNull(),
		// the end of the time this email covered, where the next one starts
		activityEndAt: timestamp("activity_end_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.sentDay] })],
)
