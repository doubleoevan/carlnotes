// the invites table
import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { primaryId } from "./columns"
import { teams } from "./teams"
import { topics } from "./topics"
import { users } from "./users"

// an invite grants access to one target, a topic or a team. it names an address, a resolved user, or nobody for a link
export const invites = pgTable(
	"invites",
	{
		id: primaryId(),
		// the invite's one target: the topic it opens, or the team it joins
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
		// what the invite's invite url includes. whoever holds it can accept it, so it is not the row's id
		token: text("token")
			.notNull()
			.$defaultFn(() => crypto.randomUUID()),
		// the invited email address, null on a link invite that names nobody
		email: text("email"),
		// the resolved recipient: set alone by a username invite, set beside the email when an email invite's address
		invitedUserId: text("invited_user_id").references(() => users.id, { onDelete: "cascade" }),
		// who created the invite, null if no creator is on record
		invitedByUserId: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
		// how many acceptances the token allows, and how many of them are spent
		maxUses: integer("max_uses").notNull().default(1),
		usedCount: integer("used_count").notNull().default(0),
		// when the token stops working on its own, and when the owner withdrew it. both null means neither has happened
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		// when the recipient turned the invitation down. kept instead of deleted so reputation can read it
		declinedAt: timestamp("declined_at", { withTimezone: true }),
		invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		// exactly one target, enforced where a race cannot slip past it
		check("invites_target_xor", sql`(${table.topicId} is not null) <> (${table.teamId} is not null)`),
		// an invite url has the token alone, so it has to be unique across every target
		unique("invites_token_unique").on(table.token),
		// one invite per target and address, so re-inviting is a no-op
		unique("invites_topic_email_unique").on(table.topicId, table.email),
		unique("invites_team_email_unique").on(table.teamId, table.email),
		// the same rule per resolved person, so re-inviting an account is a no-op across both addressings
		unique("invites_topic_invited_user_unique").on(table.topicId, table.invitedUserId),
		unique("invites_team_invited_user_unique").on(table.teamId, table.invitedUserId),
		// covers the inviter quota read, and the lookups by recipient and by address
		index("invites_invited_by_invited_at_idx").on(table.invitedByUserId, table.invitedAt),
		index("invites_invited_user_id_idx").on(table.invitedUserId),
		index("invites_email_idx").on(table.email),
	],
)
