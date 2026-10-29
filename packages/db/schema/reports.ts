// the reports table: what a user reported, the text as it stood, and how an admin resolved it
import { sql } from "drizzle-orm"
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { primaryId, reportResolution, reportSubjectKind, timestamps } from "./columns"
import { users } from "./users"

// one report. open until resolved_at is set, and hidden from its reporter while it is open or kept
export const reports = pgTable(
	"reports",
	{
		id: primaryId(),
		// what was reported, by kind and id
		subjectKind: reportSubjectKind("subject_kind").notNull(),
		subjectId: text("subject_id").notNull(),
		// the subject's author, null for a subject with none or whose account closed
		subjectAuthorUserId: text("subject_author_user_id").references(() => users.id, { onDelete: "set null" }),
		// who reported it. a closed reporter account takes its reports with it
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the reporter's reason, the subject's text at report time, and the page that held the subject
		reason: text("reason").notNull(),
		subjectText: text("subject_text").notNull(),
		subjectPath: text("subject_path").notNull(),
		// when the sweep mailed the one reminder, null until it does
		remindedAt: timestamp("reminded_at", { withTimezone: true }),
		// how, when, and by whom the report was closed. all null while it is open
		resolution: reportResolution("resolution"),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolvedByUserId: text("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(table) => [
		// one report per reporter and subject, so a second report of the same thing is a no-op
		uniqueIndex("reports_reporter_subject_unique").on(table.reporterUserId, table.subjectKind, table.subjectId),
		// the open reports, newest first
		index("reports_open_created_at_idx").on(table.createdAt).where(sql`${table.resolvedAt} is null`),
		// the subject lookups
		index("reports_subject_idx").on(table.subjectKind, table.subjectId),
	],
)
