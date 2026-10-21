// the Team tables: teams, their members, and the topics shared into them
import { sql } from "drizzle-orm"
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { primaryId, teamRole } from "./columns"
import { topics } from "./topics"
import { users } from "./users"

// a team is a named set of people that holds topics together. it is a permissions and identity object
export const teams = pgTable(
	"teams",
	{
		id: primaryId(),
		// the name and description the team page shows
		name: text("name").notNull(),
		description: text("description"),
		// the stored object for an uploaded team avatar, null for generated initials
		avatarKey: text("avatar_key"),
		// a private team's page shows a non-member its name and a way to ask to join. public renders it to anyone
		isPublic: boolean("is_public").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		// one team per name, compared in lowercase, so two teams never read as the same one
		uniqueIndex("teams_name_lower_unique").on(sql`lower(${table.name})`),
		// the trigram index behind the team name search, which matches anywhere in the lowercased name
		index("teams_name_lower_trgm").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
	],
)

// the additional teams a topic is shared into. the owning team lives on topics.team_id alone
export const teamTopics = pgTable(
	"team_topics",
	{
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.teamId, table.topicId] }),
		// the topic side covers "which teams hold this topic"
		index("team_topics_topic_id_idx").on(table.topicId),
	],
)

// a team member and their role. a leader manages the team, a member edits its topics and chats
export const teamMembers = pgTable(
	"team_members",
	{
		// the team and the member
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: teamRole("role").notNull().default("member"),
		// false is a request to join: the row grants nothing until a leader activates it
		isActive: boolean("is_active").notNull().default(true),
		// the per-team member-visibility opt-out. a hidden member leaves the public page only, never other members' view
		isMemberVisible: boolean("is_member_visible").notNull().default(true),
		// who invited them, shown in the members table's Invited by column
		invitedByUserId: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one membership per team and user, plus the lookup by user alone, where the key starts with team
	(table) => [
		primaryKey({ columns: [table.teamId, table.userId] }),
		index("team_members_user_id_idx").on(table.userId),
	],
)
