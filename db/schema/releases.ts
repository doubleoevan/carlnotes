// the releases table
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { primaryId, timestamps } from "./columns"

// a release mirrors a published GitHub release, which is where release notes are authored.
// the app reads this table instead of the GitHub API so a pageview never spends that rate limit
export const releases = pgTable("releases", {
	id: primaryId(),
	// the git tag, which GitHub only allows for one release, so a re-delivered webhook upserts this row
	tag: text("tag").notNull().unique(),
	// the release title and its body markdown, stored exactly as GitHub holds it.
	// rendered HTML is never stored, so nothing goes stale when a body is edited
	name: text("name").notNull(),
	body: text("body").notNull().default(""),
	// when the release's commit landed, which orders the page and dates the feed item. GitHub reports it as created_at,
	// and published_at is when someone pressed publish, which a backfilled release would date wrong
	releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
	// the release page's link on GitHub
	htmlUrl: text("html_url").notNull(),
	// a prerelease is stored and filtered on read, so promoting one later does not need a special write
	isPrerelease: boolean("is_prerelease").notNull().default(false),
	// created and updated timestamps
	...timestamps(),
})
