// the app's core database tables, one per domain concept. a topic feed has no table. it gets built from a topic's findings at runtime.

// enum value sets that live in @shared so that db pgEnums, api validation, and ui rendering can read one source
import {
	attachmentStatuses,
	billingIntervals,
	chatAttachmentKinds,
	daysOfWeek,
	frequencies,
	maxResultsOptions,
	plans,
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
	time,
	timestamp,
	unique,
	vector,
} from "drizzle-orm/pg-core"

// domain pgEnums built from the shared value sets
export const sourceKind = pgEnum("source_kind", sourceKinds)
export const resourceKind = pgEnum("resource_kind", resourceKinds)
export const visibility = pgEnum("visibility", visibilities)
export const frequency = pgEnum("frequency", frequencies)
export const dayOfWeek = pgEnum("day_of_week", daysOfWeek)
// the enums for a scan's outcome, a finding, and a user's account
export const scanStatus = pgEnum("scan_status", scanStatuses)
export const sourceVisibility = pgEnum("source_visibility", sourceVisibilities)
export const rating = pgEnum("rating", ratings)
export const plan = pgEnum("plan", plans)
// how often a subscription bills, this determines its plan limits and whether it supports metered overage
export const billingInterval = pgEnum("billing_interval", billingIntervals)
// the attachment async-processing status enum, shared by topic attachments and kept chat attachments
export const attachmentStatus = pgEnum("attachment_status", attachmentStatuses)
// a source's llm-guard screening status, its own type so the column's type names what it holds
export const sourceStatus = pgEnum("source_status", attachmentStatuses)
// what a kept chat attachment originally was
export const chatAttachmentKind = pgEnum("chat_attachment_kind", chatAttachmentKinds)

// the review embedding's vector width. the resources.embedding column and the worker's embed helper share this one constant
export const EMBED_DIMENSIONS = 1024

// the embedding's vector space, stamped onto embedding_model so a row names its model and dimension instead of
// the routing alias. review writes it and chat retrieval filters on it, so a changed model or dimension needs a backfill
export const EMBED_MODEL_NAME = `qwen3-embedding-8b/${EMBED_DIMENSIONS}`

// the users table. its columns match Better Auth's user schema, plus one app-specific field.
// the plural name comes from Better Auth's usePlural option.
export const users = pgTable("users", {
	id: primaryId(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	// this user's litellm virtual key, provisioned with a spend budget at signup. null only before signup completes
	litellmVirtualKey: text("litellm_virtual_key"),
	// the platform role: "admin" or "user". plain text to match Better Auth's admin plugin shape
	role: text("role").notNull().default("user"),
	// the billing plan. the Stripe webhook projects it from the user's active billing subscription, and free means there is none
	plan: plan("plan").notNull().default("free"),
	// a per-user monthly spend override in cents. an admin can raise or lower it, and null falls back to the plan's backstop
	budgetOverrideCents: integer("budget_override_cents"),
	// plain timestamps without time zone to mirror Better Auth's own schema exactly
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
})

// the sessions table. Better Auth's record of one signed-in session for a user
export const sessions = pgTable(
	"sessions",
	{
		id: primaryId(),
		// the owning user
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the session token and its expiry
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at").notNull(),
		// client metadata captured at session creation
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		// plain timestamps without time zone to mirror Better Auth's own schema exactly
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("sessions_user_id_idx").on(table.userId)],
)

// the accounts table. a sign-in identity, either a password credential or an oauth grant. a connected external account is an Integration
export const accounts = pgTable(
	"accounts",
	{
		id: primaryId(),
		// the owning user
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// which provider this identity lives at, and the user's account id there
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		// oauth grant. null for the password credential provider
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		// the hashed password. only set for the password credential provider
		password: text("password"),
		// plain timestamps without time zone to mirror Better Auth's own schema exactly
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("accounts_user_id_idx").on(table.userId)],
)

// the verifications table. Better Auth's one-time tokens for email verification and similar flows
export const verifications = pgTable(
	"verifications",
	{
		id: primaryId(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		// plain timestamps without time zone to mirror Better Auth's own schema exactly
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verifications_identifier_idx").on(table.identifier)],
)

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
		// the time of day a scan runs. stored as HH:MM:SS, the format drizzle's time column returns
		scheduledTime: time("scheduled_time").notNull().default("09:00:00"),
		// the day a weekly scan runs on. ignored for every other frequency
		scheduledDayOfWeek: dayOfWeek("scheduled_day_of_week").notNull().default("monday"),
		visibility: visibility("visibility").notNull().default("private"),
		// free-form category labels, empty by default
		tags: text("tags").array().notNull().default([]),
		// an admin can feature this topic and set its order
		featureOrder: integer("feature_order"),
		// how many findings a scan keeps for this topic, one of the shared allowed sizes
		maxResults: integer("max_results").notNull().default(10),
		// created and updated timestamps
		...timestamps(),
	},
	// the generalized inverted index for topic tag filtering, and the allowed kept-set sizes
	(table) => [
		index("topics_tags_gin").using("gin", table.tags),
		check("topics_max_results_allowed", sql.raw(`max_results in (${maxResultsOptions.join(", ")})`)),
	],
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
	// the async screening status and its failure reason. a source is ignored until it is ready:
	// hidden from anyone but the owner, and skipped by scans. a kind that is not screened is saved ready
	status: sourceStatus("status").notNull().default("pending"),
	error: text("error"),
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
	// the context the processing workflow fills once the attachment is ready. empty until then
	context: text("context").notNull().default(""),
	// the async processing status, its failure reason, and the extracted length and chunk fan-out
	status: attachmentStatus("status").notNull().default("pending"),
	error: text("error"),
	charCount: integer("char_count"),
	chunkCount: integer("chunk_count"),
	// origin URL for a URL-ingested attachment. null for file uploads
	sourceUrl: text("source_url"),
	// created and updated timestamps
	...timestamps(),
})

// a scan is the record for a single execution of the topic's pipeline
export const scans = pgTable("scans", {
	id: primaryId(),
	// the topic scanned, cleared instead of being cascaded so that a deleted topic's scans keep their spend history
	topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
	// who the scan bills and counts against. it is set at creation and never cleared,
	// so the spend and the daily count survive a topic being deleted
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
	// true when the owner triggered this scan by hand with "Run now". scheduled and seeded scans stay false
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
	// an ai written recap of what the scan did
	scanSummary: text("scan_summary"),
	// sources that had no API key for this scan and fell back to a public feed instead. empty means none did.
	fallbackSources: jsonb("fallback_sources")
		.$type<{ sourceId: string; fallbackMode: string }[]>()
		.notNull()
		.default([]),
})

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
		// a short excerpt provided by the source, small enough to stay in postgres since every list path reads it
		snippet: text("snippet"),
		// the page's full Markdown. content holds it inline for rows written before object storage.
		// content_key references it in object storage and content_bytes sizes it.
		// it is counted toward storage totals.
		content: text("content"),
		contentKey: text("content_key"),
		contentBytes: integer("content_bytes"),
		// the review embedding and its model, EMBED_DIMENSIONS wide for qwen3-embedding-8b
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }),
		embeddingModel: text("embedding_model"),
		// the source's engagement count where the ingester captured one, like a reddit post score. null means no engagement value
		engagement: integer("engagement"),
		// when review last fetched this resource's content. defaults to the resource row creation
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
		// the etag and last-modified returned by the last fetch, used to check whether the content changed before refetching.
		// null until a fetch provides them
		etag: text("etag"),
		lastModified: text("last_modified"),
		// created and updated timestamps
		...timestamps(),
	},
	(table) => [
		// speeds up the duplicate check, which otherwise reads and sorts every stored resource. cosine matches the
		// distance the check measures. the lookup is approximate, so it can occasionally let a duplicate through
		index("resources_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
	],
)

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
		// the visibility of the source that produced this finding. the pipeline doesn't populate this, so it defaults to public
		sourceVisibility: sourceVisibility("source_visibility").notNull().default("public"),
		// the owner's optional rating
		rating: rating("rating"),
		// the number of times this finding's resource has been opened
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

// a topic invite grants an email address view and subscribe access to an "invite" topic.
// it references an email, not a user row, so a topic can be shared before the invitee has an account
export const topicInvites = pgTable(
	"topic_invites",
	{
		// the topic the invite opens
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the invited email address and when it was invited
		email: text("email").notNull(),
		invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one invite per topic and email, so re-inviting is a no-op
	(table) => [primaryKey({ columns: [table.topicId, table.email] })],
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
		// unsubscribing toggles is_active off and keeps the row. only an explicit delete removes it
		isActive: boolean("is_active").notNull().default(true),
		// email cascades off whenever active turns off. it does not cascade back on when active does
		isEmailEnabled: boolean("is_email_enabled").notNull().default(true),
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

// a chat turn is one question and its reply. each one writes a row,
// because each one spends money that the monthly meter has to see,
export const chatTurns = pgTable(
	"chat_turns",
	{
		id: primaryId(),
		// who asked
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic the chat turn is about
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// what the chat turn cost, in the same dollars scans record, summed into the user's monthly spend
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the chat turn's text, stored only when the gate grants the sender chat:persist.
		// null on a chat turn whose row exists to meter its spend and nothing else
		question: text("question"),
		answer: text("answer"),
		// when the chat turn ran. the monthly spend sum uses it and the chat messages replay in its order
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// covers a user's persisted conversation read, which filters by topic and orders by time
	(table) => [index("chat_turns_topic_created_idx").on(table.topicId, table.createdAt)],
)

// a chat attachment a user chose to keep: durable, scoped to one user's conversation with on a topic,
// re-delivered to every future chat turn they take there.
export const chatAttachments = pgTable(
	"chat_attachments",
	{
		id: primaryId(),
		// who kept it, and for which topic's conversation. either deletion takes the kept attachment with it
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		kind: chatAttachmentKind("kind").notNull(),
		name: text("name").notNull(),
		// where an image or PDF's original bytes live in object storage. null for kept text, which has no file
		objectKey: text("object_key"),
		contentType: text("content_type"),
		byteSize: integer("byte_size"),
		// a kept paste or text file's own words, encrypted like a chat turn's text. null for image and PDF,
		// whose original lives in object storage
		rawText: text("raw_text"),
		// the summary that is included in every future chat turn, generated once. empty until the background job finishes
		context: text("context").notNull().default(""),
		status: attachmentStatus("status").notNull().default("pending"),
		error: text("error"),
		...timestamps(),
	},
	// the read path always filters by exactly this pair
	(table) => [index("chat_attachments_user_topic_idx").on(table.userId, table.topicId)],
)

// a billing subscription is a user's active paid Stripe subscription.
export const billingSubscriptions = pgTable("billing_subscriptions", {
	id: primaryId(),
	// the subscriber. one active billing subscription per user, so the user id is unique and cascades with the user
	userId: text("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	// the Stripe customer and subscription this row mirrors
	stripeCustomerId: text("stripe_customer_id").notNull(),
	stripeSubscriptionId: text("stripe_subscription_id").notNull(),
	// the plan this subscription grants, the Stripe status it mirrors, and when the current period ends
	plan: plan("plan").notNull(),
	status: text("status").notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
	// whether Stripe has a payment method to charge, and how often this subscription bills.
	// the billing interval decides both the plan's limits and whether a scan past the daily one can be billed at all.
	// only a monthly billing interval includes the metered overage price.
	hasPaymentMethod: boolean("has_payment_method").notNull().default(false),
	billingInterval: billingInterval("interval").notNull().default("monthly"),
	// created and updated timestamps
	...timestamps(),
})

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
