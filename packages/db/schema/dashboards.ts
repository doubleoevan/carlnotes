// the dashboard snapshots: each Dashboard's data for one selection and one access level, built nightly
import { date, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { dashboardAccessLevel, dashboardKind, primaryId, timestamps } from "./columns"

// one Dashboard's data for one selection and one access level. the summary selection holds the strip, Carl's
// paragraph, and the share image, and every other selection, an item kind or a format, holds every chart's series
export const dashboardSnapshots = pgTable(
	"dashboard_snapshots",
	{
		id: primaryId(),
		// the Dashboard: its kind and its subject, the person or the team
		dashboardKind: dashboardKind("dashboard_kind").notNull(),
		subjectId: text("subject_id").notNull(),
		// summary, an item kind (topic, finding, topicPost), or a format (audio, video, both)
		selection: text("selection").notNull(),
		accessLevel: dashboardAccessLevel("access_level").notNull(),
		// the last completed UTC day the snapshot counts, its data, and the hash that tells an unchanged one apart
		day: date("day").notNull(),
		body: jsonb("body").notNull(),
		contentHash: text("content_hash").notNull(),
		// a summary's paragraph from Carl and its share image's object key, null until written or for other selections
		paragraph: text("paragraph"),
		imageKey: text("image_key"),
		// created and updated timestamps
		...timestamps(),
	},
	// one snapshot per Dashboard, selection, and access level
	(table) => [
		uniqueIndex("dashboard_snapshots_subject_idx").on(
			table.dashboardKind,
			table.subjectId,
			table.selection,
			table.accessLevel,
		),
	],
)
