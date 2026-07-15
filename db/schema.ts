// the carlnotes domain model: the canonical entities as postgres tables (Feed is a route, not a table)
import { sql } from "drizzle-orm"
// biome-ignore format: one line keeps the comment-group hook seeing a single import statement
import { boolean, check, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, real, text, timestamp, unique, vector } from "drizzle-orm/pg-core"

// enum value sets shared across tables (these const arrays move to shared/ with the Feed UI change)
export const sourceKind = pgEnum("source_kind", ["rss", "reddit", "youtube", "search", "composio", "plugin"])
export const resourceKind = pgEnum("resource_kind", ["read", "watch", "listen"])
export const privacy = pgEnum("privacy", ["public", "invite", "private"])
export const cadence = pgEnum("cadence", ["daily", "weekly"])
export const scanStatus = pgEnum("scan_status", ["running", "succeeded", "failed"])
export const sourceVisibility = pgEnum("source_visibility", ["public", "private"])
export const thumbs = pgEnum("thumbs", ["up", "down"])

// identity anchor, shaped to Better Auth's core user columns so Better Auth adopts it at launch (via usePlural)
export const users = pgTable("users", {
	id: primaryId(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	// plain timestamps (no tz) to mirror Better Auth's own schema exactly
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
})

// a user's connected external account: connected once, referenced by Sources (input) and later deliveries (output)
export const integrations = pgTable("integrations", {
	id: primaryId(),
	// the owning user
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// provider name plus the Composio-managed or native grant and scopes
	provider: text("provider").notNull(),
	scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
	oauthGrant: jsonb("oauth_grant").$type<Record<string, unknown>>(),
	// created/updated timestamps
	...timestamps(),
})

// the configuration a user tunes; owner_id is the only authority (no role enum)
export const topics = pgTable("topics", {
	id: primaryId(),
	// the owner; the only authority for the topic
	ownerId: text("owner_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// what the pipeline scores against
	name: text("name").notNull(),
	context: text("context").notNull().default(""),
	// how often to scan, and who may see the feed
	cadence: cadence("cadence").notNull().default("daily"),
	privacy: privacy("privacy").notNull().default("private"),
	// created/updated timestamps
	...timestamps(),
})

// a topic input ("pull from X"); integration_id is nullable so keyless sources (RSS) need no credential
export const sources = pgTable("sources", {
	id: primaryId(),
	// the topic this source feeds
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// the source kind and its per-kind settings (RSS url, subreddit, query, Composio toolkit)
	kind: sourceKind("kind").notNull(),
	config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
	// credentials resolve through the referenced Integration when present (nullable: RSS needs none)
	integrationId: text("integration_id").references(() => integrations.id, { onDelete: "set null" }),
	// created/updated timestamps
	...timestamps(),
})

// a file a user attaches to a Topic for context: the raw file lives in object storage, its extracted context is what scans read
export const attachments = pgTable("attachments", {
	id: primaryId(),
	// the topic this attachment gives context to
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// where the raw file lives in object storage (the S3/R2 key), plus its original name, type, and size
	objectKey: text("object_key").notNull(),
	filename: text("filename").notNull(),
	contentType: text("content_type").notNull(),
	byteSize: integer("byte_size").notNull(),
	// the context extracted from the file, filled once at upload so a scan never re-processes the file
	context: text("context").notNull().default(""),
	// created/updated timestamps
	...timestamps(),
})

// one execution of a topic's pipeline; only a succeeded scan advances the diff-since-last-scan baseline
export const scans = pgTable("scans", {
	id: primaryId(),
	// the topic scanned
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// lifecycle: running until it succeeds or fails, with the failure reason when it fails
	status: scanStatus("status").notNull().default("running"),
	error: text("error"),
	// when it ran
	startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	// what it cost and how many resources it found, kept, and filtered
	cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
	foundCount: integer("found_count").notNull().default(0),
	keptCount: integer("kept_count").notNull().default(0),
	filteredCount: integer("filtered_count").notNull().default(0),
	// per-stage dollar breakdown of `cost` (embedding, fetch, cheap/premium scoring); `cost` stays the total
	stageCosts: jsonb("stage_costs").$type<Record<string, number>>().notNull().default({}),
	// llm-written recap of what the scan did, shown in topic history
	aiSummary: text("ai_summary"),
	// sources that ran a keyless fallback this scan, so degraded provenance stays traceable (empty when none did)
	degradedSources: jsonb("degraded_sources")
		.$type<{ sourceId: string; fallbackMode: string }[]>()
		.notNull()
		.default([]),
})

// a canonical external artifact, deduped globally by url; the embedding is filled later by the pipeline
export const resources = pgTable("resources", {
	id: primaryId(),
	// canonical url is the global dedupe key; the content hash catches content-level duplicates
	url: text("url").notNull().unique(),
	contentHash: text("content_hash"),
	// how the resource is consumed, and its display title
	kind: resourceKind("kind").notNull(),
	title: text("title"),
	// pipeline-filled text: the adapter-native snippet (description/selftext/highlights), and the full content curation fetches
	snippet: text("snippet"),
	content: text("content"),
	// nullable until the pipeline embeds it; embedding_model records which model produced the vector
	embedding: vector("embedding", { dimensions: 768 }),
	embeddingModel: text("embedding_model"),
	// created/updated timestamps
	...timestamps(),
})

// a topic-scoped judgment about a resource; unique(topic, resource) so re-scoring updates in place
export const findings = pgTable(
	"findings",
	{
		id: primaryId(),
		// the topic that judged the resource
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the resource that was judged
		resourceId: text("resource_id")
			.notNull()
			.references(() => resources.id, { onDelete: "cascade" }),
		// the scan that produced this finding
		scanId: text("scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		// the model's relevance score and its one-line why, shown in the feed
		signalScore: real("signal_score").notNull(),
		whySummary: text("why_summary").notNull().default(""),
		// provenance gate for sharing, plus the owner's optional thumbs feedback
		sourceVisibility: sourceVisibility("source_visibility").notNull().default("public"),
		thumbs: thumbs("thumbs"),
		// created/updated timestamps
		...timestamps(),
	},
	// one finding per (topic, resource): re-scoring updates the existing row instead of duplicating
	(table) => [unique("findings_topic_resource_unique").on(table.topicId, table.resourceId)],
)

// a named set of users that subscribes as one (the "friend-group feeds" entity)
export const audiences = pgTable("audiences", {
	id: primaryId(),
	// the owner of the audience
	ownerId: text("owner_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// display name for the group
	name: text("name").notNull(),
	// created/updated timestamps
	...timestamps(),
})

// join: which users belong to which audience; members inherit the audience's subscriptions
export const audienceMembers = pgTable(
	"audience_members",
	{
		// the audience
		audienceId: text("audience_id")
			.notNull()
			.references(() => audiences.id, { onDelete: "cascade" }),
		// the member user
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// when the user joined the audience
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// a user belongs to an audience at most once
	(table) => [primaryKey({ columns: [table.audienceId, table.userId] })],
)

// subscriber ↔ topic join; the subscriber is exactly one of a user or an audience (a db CHECK enforces the xor)
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: primaryId(),
		// the topic being subscribed to
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// exactly one subscriber: a user or an audience, never both and never neither
		subscriberUserId: text("subscriber_user_id").references(() => users.id, { onDelete: "cascade" }),
		subscriberAudienceId: text("subscriber_audience_id").references(() => audiences.id, { onDelete: "cascade" }),
		// delivery preferences for this subscriber
		cadence: cadence("cadence").notNull().default("daily"),
		digest: boolean("digest").notNull().default(true),
		// created/updated timestamps
		...timestamps(),
	},
	// enforce exactly-one-subscriber at the database, not just in app code
	(table) => [
		check(
			"subscriptions_subscriber_xor",
			sql`(${table.subscriberUserId} is not null) <> (${table.subscriberAudienceId} is not null)`,
		),
	],
)

// every table's text primary key: our code defaults it; Better Auth overrides it on its own inserts
function primaryId() {
	return text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID())
}

// created/updated timestamps shared by every entity that tracks them (timestamptz)
function timestamps() {
	return {
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		// updated_at auto-touches on every write
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	}
}
