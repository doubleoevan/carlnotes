// the spend control settings table: the admin overrides on the daily spend cutoffs, the first scan dispatch limit, the
// hourly signup alert, and the generated chapter image limit, with the unverified accounts switch, the two pauses,
// and the pinned-only home
import { sql } from "drizzle-orm"
import { boolean, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { users } from "./users"

// the one row of overrides. a missing row or a null column reads as that setting's default
export const spendControlSettings = pgTable(
	"spend_control_settings",
	{
		// always 1, so the table holds one row
		id: integer("id").primaryKey().default(1),
		// each daily spend cutoff in cents of the day's free-plan spend
		podcastEpisodesCutoffCents: integer("podcast_episodes_cutoff_cents"),
		scheduledScansCutoffCents: integer("scheduled_scans_cutoff_cents"),
		chatCutoffCents: integer("chat_cutoff_cents"),
		// how many waiting scans one sweep starts, and how many signups in an hour send an alert
		firstScanDispatchLimit: integer("first_scan_dispatch_limit"),
		hourlySignupAlertCount: integer("hourly_signup_alert_count"),
		// whether the first scan dispatch limit applies to unverified password accounts whatever the day's spend
		isUnverifiedFirstScanLimitOn: boolean("is_unverified_first_scan_limit_on").notNull().default(false),
		// whether a Scan records no new podcast episode, and whether a new podcast episode starts no film
		isPodcastEpisodeRecordingPaused: boolean("is_podcast_episode_recording_paused").notNull().default(false),
		isTopicPodcastEpisodeVideoRenderingPaused: boolean("is_topic_podcast_episode_video_rendering_paused")
			.notNull()
			.default(false),
		// how many generated images one film may draw, where zero draws none
		generatedChapterImageLimit: integer("generated_chapter_image_limit"),
		// whether the home's card sections hold only the items an admin pinned
		isHomePinnedOnly: boolean("is_home_pinned_only").notNull().default(false),
		// when the row was saved, and the admin who saved it, kept as null once their account closes
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
	},
	// one row, and only values the admin console accepts
	(table) => [
		check("spend_control_settings_single_row", sql`${table.id} = 1`),
		check(
			"spend_control_settings_values",
			sql`coalesce(${table.podcastEpisodesCutoffCents}, 1) > 0 and coalesce(${table.scheduledScansCutoffCents}, 1) > 0 and coalesce(${table.chatCutoffCents}, 1) > 0 and coalesce(${table.firstScanDispatchLimit}, 0) >= 0 and coalesce(${table.hourlySignupAlertCount}, 1) >= 1`,
		),
		check(
			"spend_control_settings_generated_chapter_image_limit",
			sql`coalesce(${table.generatedChapterImageLimit}, 0) >= 0`,
		),
	],
)
