// the scan pipeline's tables: scans, resources, findings, and the per-user finding markers
import type { StoredScanSourceResults } from "@carlnotes/contracts/topics"
import { sql } from "drizzle-orm"
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	vector,
} from "drizzle-orm/pg-core"
import { primaryId, rating, resourceKind, scanStatus, sourceVisibility, timestamps } from "./columns"
import { topics } from "./topics"
import { users } from "./users"

// the review embedding's vector width
export const EMBED_DIMENSIONS = 1024

// the embedding's vector space, saved onto embedding_model
export const EMBED_MODEL_NAME = `qwen3-embedding-8b/${EMBED_DIMENSIONS}`

// a scan is the record for a single execution of the topic's pipeline
export const scans = pgTable(
	"scans",
	{
		id: primaryId(),
		// the topic scanned, cleared instead of being cascaded so that a deleted topic's scans keep their spend history
		topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
		// who the scan bills and counts against
		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the scan status. running until it succeeds or fails. error holds a failure reason
		status: scanStatus("status").notNull().default("running"),
		error: text("error"),
		// when the scan pipeline ran
		startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		// when the scan's workflow was accepted. null means it was never started
		dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
		// when a worker first began the scan's first stage. null while the dispatched scan waits for a scan slot
		pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
		// when the user stopped the scan
		stoppedAt: timestamp("stopped_at", { withTimezone: true }),
		// true if the owner triggered this scan by hand with "Run now". scheduled and seeded scans stay false
		isManual: boolean("is_manual").notNull().default(false),
		// what it cost and how many resources the scan found, kept, and filtered
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		foundCount: integer("found_count").notNull().default(0),
		keptCount: integer("kept_count").notNull().default(0),
		filteredCount: integer("filtered_count").notNull().default(0),
		// how many of the scan's resources had their content reused within the ttl, revalidated via a 304, or freshly fetched
		reused: integer("reused").notNull().default(0),
		revalidated: integer("revalidated").notNull().default(0),
		fetched: integer("fetched").notNull().default(0),
		// per-stage breakdown of costs: embedding, fetch, cheap/premium scoring. `cost` holds the total
		stageCosts: jsonb("stage_costs").$type<Record<string, number>>().notNull().default({}),
		// an AI written recap of what the scan did
		scanSummary: text("scan_summary"),
		// sources that fell back to a keyless path, failed outright, or were skipped
		problemSources: jsonb("problem_sources")
			// each problem source entry names its source and why it is listed
			.$type<
				(
					| { sourceId: string; status: "fallback"; fallbackMode: string }
					| { sourceId: string; status: "failed"; reason: string }
					| { sourceId: string; status: "skipped" }
				)[]
			>()
			.notNull()
			.default([]),
		// one result per Source, each credited with the Resources whose copy survived the merge, and the kept findings
		// from earlier scans that no Source returned. null for a scan with no closing write
		sourceResults: jsonb("source_results").$type<StoredScanSourceResults | null>(),
	},
	// covers the topic history read and the per-owner daily count and monthly spend sums
	(table) => [
		index("scans_topic_started_idx").on(table.topicId, table.startedAt),
		index("scans_owner_started_idx").on(table.ownerId, table.startedAt),
	],
)

// a resource is an external artifact discovered by a scan, shared globally across topics
export const resources = pgTable(
	"resources",
	{
		id: primaryId(),
		// the canonical url is the global dedupe key. the content hash catches content-level duplicates
		url: text("url").notNull().unique(),
		contentHash: text("content_hash"),
		// the type of resource ("read", "watch", "listen"), and its display title
		kind: resourceKind("kind").notNull(),
		title: text("title"),
		// a short excerpt provided by the source, small enough to stay in postgres
		snippet: text("snippet"),
		// the page's full Markdown. content is inline for old rows, content_key points into object storage
		content: text("content"),
		contentKey: text("content_key"),
		contentBytes: integer("content_bytes"),
		// the review embedding and its model, EMBED_DIMENSIONS wide for qwen3-embedding-8b
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }),
		embeddingModel: text("embedding_model"),
		// no longer read or written. a later migration drops it, once no process from before viewer counts runs
		engagement: integer("engagement"),
		// when review last fetched this resource's content. defaults to the resource row creation
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
		// the etag and last-modified returned by the last fetch, used to check whether the content changed before
		etag: text("etag"),
		lastModified: text("last_modified"),
		// where the source published a transcript of this resource, like a podcast feed's transcript link
		transcriptUrl: text("transcript_url"),
		// created and updated timestamps
		...timestamps(),
	},
	(table) => [
		// speeds up the duplicate check, which otherwise reads and sorts every stored resource
		index("resources_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
		// a resource by its content hash, for the duplicate check review runs on every fetched page
		index("resources_content_hash_idx").on(table.contentHash),
		// the trigram index behind the site search's finding match, over the lowercased title, else the url
		index("resources_title_or_url_lower_trgm").using(
			"gin",
			sql`lower(coalesce(${table.title}, ${table.url})) gin_trgm_ops`,
		),
	],
)

// a finding is a topic-scoped record holding a relevance review about a discovered resource
export const findings = pgTable(
	"findings",
	{
		id: primaryId(),
		// the topic that reviewed the resource
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the resource that was reviewed
		resourceId: text("resource_id")
			.notNull()
			.references(() => resources.id, { onDelete: "cascade" }),
		// the latest topic scan that reviewed this finding. a re-score moves it to that scan
		scanId: text("scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		// the topic scan that first found this finding, written once on insert. null if that scan was deleted
		foundScanId: text("found_scan_id").references(() => scans.id, { onDelete: "set null" }),
		// the model's relevance score and its explanation
		relevanceScore: real("relevance_score").notNull(),
		relevanceExplanation: text("relevance_explanation").notNull().default(""),
		// what this review was made against. a null context hash reviews again on the next scan
		reviewedContextHash: text("reviewed_context_hash"),
		reviewedContentHash: text("reviewed_content_hash"),
		// the visibility of the source that produced this finding. the pipeline doesn't populate this, so it defaults to public
		sourceVisibility: sourceVisibility("source_visibility").notNull().default("public"),
		// whether a custom Source found this finding
		isFromCustomSource: boolean("is_from_custom_source").notNull().default(false),
		// the owner's optional rating
		rating: rating("rating"),
		// who cast the current thumb and the role held then. nothing reads these for scoring
		ratedByUserId: text("rated_by_user_id"),
		ratedTeamId: text("rated_team_id"),
		ratedRole: text("rated_role"),
		// the number of times this finding's resource has been opened
		viewCount: integer("view_count").notNull().default(0),
		// no longer read or written. a later migration drops it, once no process that counts finding viewers runs
		viewerCount: integer("viewer_count").notNull().default(0),
		// created and updated timestamps
		...timestamps(),
	},
	(table) => [
		// one finding per topic and resource. re-scoring updates the existing row instead of adding another
		unique("findings_topic_resource_unique").on(table.topicId, table.resourceId),
		// a topic's findings, most relevant first, for the feed's ranked read and the topic page.
		// nulls first is what a plain descending order means, so an index scan returns both reads' rows already in order
		index("findings_topic_relevance_idx").on(table.topicId, table.relevanceScore.desc().nullsFirst()),
		// the findings a scan last reviewed, for a public topic page's structured data
		index("findings_scan_id_idx").on(table.scanId),
		// a resource's findings, for the site search's finding match, which starts from the resources
		index("findings_resource_id_idx").on(table.resourceId),
		// the findings a scan first found, for a scan email and a podcast episode's plan
		index("findings_found_scan_id_idx").on(table.foundScanId),
		// a topic's findings by when they arrived, for the new finding count and the reads that take a topic's latest findings
		index("findings_topic_created_idx").on(table.topicId, table.createdAt),
	],
)

// a consumption is the record of a user marking a topic finding as consumed
export const consumptions = pgTable(
	"consumptions",
	{
		id: primaryId(),
		// the user who marked the topic finding consumed
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic finding that was consumed
		findingId: text("finding_id")
			.notNull()
			.references(() => findings.id, { onDelete: "cascade" }),
		// when the topic finding was marked consumed
		consumedAt: timestamp("consumed_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one consumed marker per user and finding. marking twice is a no-op and unmarking deletes the row
	(table) => [unique("consumptions_user_finding_unique").on(table.userId, table.findingId)],
)

// a bookmark is the record of a user keeping a topic finding regardless of the max-results filter
export const bookmarks = pgTable(
	"bookmarks",
	{
		id: primaryId(),
		// the user who bookmarked the topic finding
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic finding kept
		findingId: text("finding_id")
			.notNull()
			.references(() => findings.id, { onDelete: "cascade" }),
		// when the topic finding was bookmarked
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one bookmark per user and finding. bookmarking twice is a no-op and unbookmarking deletes the row
	(table) => [unique("bookmarks_user_finding_unique").on(table.userId, table.findingId)],
)

// a user's own words about a finding
export const findingFeedback = pgTable("finding_feedback", {
	id: primaryId(),
	// the finding and topic the words are about
	findingId: text("finding_id")
		.notNull()
		.references(() => findings.id, { onDelete: "cascade" }),
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// who wrote it
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	feedback: text("feedback").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
})

// one view event per open or dismissal of a finding, written and never read
export const findingViews = pgTable(
	"finding_views",
	{
		id: primaryId(),
		// the finding and the user
		findingId: text("finding_id")
			.notNull()
			.references(() => findings.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// exactly one of the two is set by the writer: an open, or a dismissal
		openedAt: timestamp("opened_at", { withTimezone: true }),
		dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
		// how long the user spent on the note, reported when they leave it
	},
	// covers the view lookup by user and finding
	(table) => [index("finding_views_user_finding_idx").on(table.userId, table.findingId)],
)
