// the app's core database tables, one per domain concept. a topic feed has no table. it gets built from a topic's findings at runtime.

// enum value sets that live in @shared so that db pgEnums, api validation, and ui rendering can read one source
import {
	frequencies,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	sourceVisibilities,
	visibilities,
} from "@shared/enums"
import { sql } from "drizzle-orm"
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	unique,
	vector,
} from "drizzle-orm/pg-core"

// domain pgEnums built from the shared value sets
export const sourceKind = pgEnum("source_kind", sourceKinds)
export const resourceKind = pgEnum("resource_kind", resourceKinds)
export const visibility = pgEnum("visibility", visibilities)
export const frequency = pgEnum("frequency", frequencies)
export const scanStatus = pgEnum("scan_status", scanStatuses)
export const sourceVisibility = pgEnum("source_visibility", sourceVisibilities)
export const rating = pgEnum("rating", ratings)

// the users table. its columns match Better Auth's user schema.
// the plural name comes from Better Auth's usePlural option.
export const users = pgTable("users", {
	id: primaryId(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	// plain timestamps without time zone to mirror Better Auth's own schema exactly
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
})

// an integration is a user's connected external account. sources pull with it and deliveries send with it
export const integrations = pgTable("integrations", {
	id: primaryId(),
	// the owning user
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// the provider name, its oauth grant, and the granted scopes
	provider: text("provider").notNull(),
	scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
	oauthGrant: jsonb("oauth_grant").$type<Record<string, unknown>>(),
	// created and updated timestamps
	...timestamps(),
})

// a topic is the user's configuration of what to scan for
export const topics = pgTable(
	"topics",
	{
		id: primaryId(),
		// the owner
		ownerId: text("owner_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic name and the prompt that the pipeline scores against
		name: text("name").notNull(),
		prompt: text("prompt").notNull().default(""),
		// how often to scan, and who may see the topic feed
		frequency: frequency("frequency").notNull().default("daily"),
		visibility: visibility("visibility").notNull().default("private"),
		// free-form category labels, empty by default
		tags: text("tags").array().notNull().default([]),
		// an admin can feature this topic and set its order
		featureOrder: integer("feature_order"),
		// created and updated timestamps
		...timestamps(),
	},
	// the generalized inverted index for topic tag filtering
	(table) => [index("topics_tags_gin").using("gin", table.tags)],
)

// a source is a topic input that scans pull resources from
export const sources = pgTable("sources", {
	id: primaryId(),
	// the topic this source feeds
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// the source kind: rss, reddit, YouTube, search, composio, or plugin. config holds its per-kind settings
	kind: sourceKind("kind").notNull(),
	config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
	// credentials resolve through an integration when present
	integrationId: text("integration_id").references(() => integrations.id, { onDelete: "set null" }),
	// created and updated timestamps
	...timestamps(),
})

// an attachment is a file or url that adds context to a topic
export const attachments = pgTable("attachments", {
	id: primaryId(),
	// the topic this attachment adds context to
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// where the raw file lives in object storage, plus its original name, type, and size
	objectKey: text("object_key").notNull(),
	filename: text("filename").notNull(),
	contentType: text("content_type").notNull(),
	byteSize: integer("byte_size").notNull(),
	// the context extracted from the file, filled once on upload
	context: text("context").notNull().default(""),
	// origin URL for a URL-ingested attachment. null for file uploads
	sourceUrl: text("source_url"),
	// created and updated timestamps
	...timestamps(),
})

// a scan is the record for a single execution of the topic's pipeline
export const scans = pgTable("scans", {
	id: primaryId(),
	// the topic scanned
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// the scan status. running until it succeeds or fails. error holds a failure reason
	status: scanStatus("status").notNull().default("running"),
	error: text("error"),
	// when the scan pipeline ran
	startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true }),
	// what it cost and how many resources the scan found, kept, and filtered
	cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
	foundCount: integer("found_count").notNull().default(0),
	keptCount: integer("kept_count").notNull().default(0),
	filteredCount: integer("filtered_count").notNull().default(0),
	// per-stage breakdown of costs: embedding, fetch, cheap/premium scoring. `cost` holds the total
	stageCosts: jsonb("stage_costs").$type<Record<string, number>>().notNull().default({}),
	// an ai written recap of what the scan did
	scanSummary: text("scan_summary"),
	// sources that had no API key for this scan and fell back to a public feed instead. empty means none did.
	degradedSources: jsonb("degraded_sources")
		.$type<{ sourceId: string; fallbackMode: string }[]>()
		.notNull()
		.default([]),
})

// a resource is an external artifact discovered by a scan, shared globally across topics
export const resources = pgTable("resources", {
	id: primaryId(),
	// the canonical url is the global dedupe key. the content hash catches content-level duplicates
	url: text("url").notNull().unique(),
	contentHash: text("content_hash"),
	// the type of resource ("read", "watch", "listen"), and its display title
	kind: resourceKind("kind").notNull(),
	title: text("title"),
	// a short excerpt provided by the source, and the full content the pipeline fetches later
	snippet: text("snippet"),
	content: text("content"),
	// a vector embedding for semantic search and its model
	embedding: vector("embedding", { dimensions: 768 }),
	embeddingModel: text("embedding_model"),
	// when review last fetched this resource's content. defaults to the resource row creation
	fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
	// created and updated timestamps
	...timestamps(),
})

// a finding is a topic-scoped record holding a relevance judgment about a discovered resource
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
		// the topic scan that produced this finding
		scanId: text("scan_id")
			.notNull()
			.references(() => scans.id, { onDelete: "cascade" }),
		// the model's relevance score and its explanation
		relevanceScore: real("relevance_score").notNull(),
		relevanceExplanation: text("relevance_explanation").notNull().default(""),
		// the visibility of the source that produced this finding. the pipeline does not set this yet
		sourceVisibility: sourceVisibility("source_visibility").notNull().default("public"),
		// the owner's optional rating
		rating: rating("rating"),
		//the number of times this resource has been opened
		viewCount: integer("view_count").notNull().default(0),
		// created and updated timestamps
		...timestamps(),
	},
	// one finding per topic and resource. re-scoring updates the existing row instead of adding another
	(table) => [unique("findings_topic_resource_unique").on(table.topicId, table.resourceId)],
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

// an audience is a named set of users that subscribes to topics as one
export const audiences = pgTable("audiences", {
	id: primaryId(),
	// the owner of the audience
	ownerId: text("owner_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// display name for the audience
	name: text("name").notNull(),
	// created and updated timestamps
	...timestamps(),
})

// an audience member maps a user to an audience
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

// a subscription maps a topic to its subscriber, either a user or an audience
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
		// delivery preference for this subscriber
		frequency: frequency("frequency").notNull().default("daily"),
		// created and updated timestamps
		...timestamps(),
	},
	// enforce exactly-one-subscriber at the database level
	(table) => [
		check(
			"subscriptions_subscriber_xor",
			sql`(${table.subscriberUserId} is not null) <> (${table.subscriberAudienceId} is not null)`,
		),
	],
)

// every table's text primary key. our code defaults it. Better Auth overrides it on its own inserts
function primaryId() {
	return text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID())
}

// created and updated timestamps with time zones, used by every table except users
function timestamps() {
	return {
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		// updated_at auto-touches on every table row write
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	}
}
