// the emails a Topic sent
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { primaryId } from "./columns"
import { scans } from "./scans"
import { topics } from "./topics"
import { users } from "./users"

// an email that a topic sent that resend accepted to be tracked by the admin page
export const topicEmailSends = pgTable(
	"topic_email_sends",
	{
		id: primaryId(),
		// the topic the email was about
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// who received the email, null for an invitee with no account yet
		recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
		// which kind of email went out: topic-scan, manual-scan, or topic-invite
		emailKind: text("email_kind").notNull(),
		// the Scan that sent the email. null for an invite, and for a scan email older than this column
		scanId: text("scan_id").references(() => scans.id, { onDelete: "set null" }),
		sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one row per Scan and recipient, so a retried send is recorded once. rows without a Scan never collide. the second
	// index reads a topic's sends to each recipient in time order
	(table) => [
		uniqueIndex("topic_email_sends_scan_recipient_unique").on(table.scanId, table.recipientUserId),
		index("topic_email_sends_topic_recipient_sent_idx").on(table.topicId, table.recipientUserId, table.sentAt),
	],
)
