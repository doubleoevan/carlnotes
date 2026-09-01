// the app's core database tables, one per domain concept

// enum value sets that live in @shared so that db pgEnums, api validation, and ui rendering can read one source
import {
	attachmentStatuses,
	avatarSources,
	billingIntervals,
	chatAttachmentKinds,
	daysOfWeek,
	frequencies,
	inviteAccesses,
	maxResultsOptions,
	noteVisibilities,
	plans,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	sourceVisibilities,
	teamRoles,
	visibilities,
} from "@shared/enums"
import { sql } from "drizzle-orm"
import {
	bigint,
	boolean,
	check,
	customType,
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
	uniqueIndex,
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
// where a user's public avatar image comes from. only oauth and upload have a stored object
export const avatarSource = pgEnum("avatar_source", avatarSources)
// a member's team role, and who may address an invite to a user
export const teamRole = pgEnum("team_role", teamRoles)
export const inviteAccess = pgEnum("invite_access", inviteAccesses)
// who may see a note
export const noteVisibility = pgEnum("note_visibility", noteVisibilities)

// the review embedding's vector width
export const EMBED_DIMENSIONS = 1024

// the embedding's vector space, saved onto embedding_model
export const EMBED_MODEL_NAME = `qwen3-embedding-8b/${EMBED_DIMENSIONS}`

// the users table
export const users = pgTable(
	"users",
	{
		id: primaryId(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		// the public username as the user sees it, generated during signup so a row is never null
		username: text("username").notNull(),
		// the normalized username to search for already taken ones
		usernameNormalized: text("username_normalized").notNull(),
		// where the public avatar comes from, and the stored object for it
		avatarSource: avatarSource("avatar_source").notNull().default("generated"),
		avatarKey: text("avatar_key"),
		// this user's litellm virtual key, provisioned with a spend budget at signup. null only before signup completes
		litellmVirtualKey: text("litellm_virtual_key"),
		// the platform role: "admin" or "user". plain text to match Better Auth's admin plugin shape
		role: text("role").notNull().default("user"),
		// who may address an invite to this user, enforced at invite creation and nowhere else
		inviteAccess: inviteAccess("invite_access").notNull().default("anyone"),
		// the billing plan
		plan: plan("plan").notNull().default("free"),
		// a per-user monthly spend override in cents. an admin can raise or lower it, and null falls back to the plan's backstop
		budgetOverrideCents: integer("budget_override_cents"),
		// plain timestamps without time zone to mirror Better Auth's own schema exactly
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	// enforces username uniqueness, compared on the normalized form
	(table) => [uniqueIndex("users_username_normalized_unique").on(table.usernameNormalized)],
)

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

// the accounts table
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
		// the team that holds this topic, or null for a topic on no team
		teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
		// free-form category labels, empty by default
		tags: text("tags").array().notNull().default([]),
		// an admin can feature this topic and set its order
		featureOrder: integer("feature_order"),
		// how many findings a scan keeps for this topic, one of the shared allowed sizes
		maxResults: integer("max_results").notNull().default(10),
		// the unique subscriber count for the topic's active subscribers, not including the owner
		subscriberCount: integer("subscriber_count").notNull().default(0),
		// created and updated timestamps
		...timestamps(),
	},
	// the generalized inverted index for topic tag filtering, and the allowed kept-set sizes
	(table) => [
		index("topics_tags_gin").using("gin", table.tags),
		// covers the owner and team topic lists
		index("topics_owner_id_idx").on(table.ownerId),
		index("topics_team_id_idx").on(table.teamId),
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
	// the source kind: url, rss, reddit, YouTube, podcast, search, bluesky, x, composio, or plugin
	kind: sourceKind("kind").notNull(),
	config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
	// credentials resolve through an integration when present
	integrationId: text("integration_id").references(() => integrations.id, { onDelete: "set null" }),
	// the async screening status and its failure reason
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
		// sources that did not deliver normally: one that fell back to a keyless path, or one that failed outright
		problemSources: jsonb("problem_sources")
			.$type<
				(
					| { sourceId: string; status: "fallback"; fallbackMode: string }
					| { sourceId: string; status: "failed"; reason: string }
				)[]
			>()
			.notNull()
			.default([]),
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
		// the source's engagement count where the ingester captured one, like a reddit post score. null means no engagement value
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
		// who cast the current thumb and the role held then. nothing reads these for scoring
		ratedByUserId: text("rated_by_user_id"),
		ratedTeamId: text("rated_team_id"),
		ratedRole: text("rated_role"),
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
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
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

// an email that a topic sent that resend accepted to be tracked by the admin page
export const topicEmailSends = pgTable("topic_email_sends", {
	id: primaryId(),
	// the topic the email was about
	topicId: text("topic_id")
		.notNull()
		.references(() => topics.id, { onDelete: "cascade" }),
	// who received the email, null for an invitee with no account yet
	recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
	// which kind of email went out: topic-scan, manual-scan, or topic-invite
	emailKind: text("email_kind").notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
})

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
		// a private team's page returns a 404 to outsiders. public renders it to anyone
		isPublic: boolean("is_public").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		// one team per name, compared in lowercase, so two teams never read as the same one
		uniqueIndex("teams_name_lower_unique").on(sql`lower(${table.name})`),
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

// one embedded section of the documentation, retrieved into chat when a question asks about the app
export const docsChunks = pgTable(
	"docs_chunks",
	{
		id: primaryId(),
		// the docs page and section heading the words came from
		page: text("page").notNull(),
		heading: text("heading").notNull(),
		content: text("content").notNull(),
		// the content's hash, so the sync only re-embeds what changed
		contentHash: text("content_hash").notNull(),
		embedding: vector("embedding", { dimensions: EMBED_DIMENSIONS }).notNull(),
		embeddingModel: text("embedding_model").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [unique("docs_chunks_page_heading_unique").on(table.page, table.heading)],
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

// a subscription maps a topic to its subscribing user
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: primaryId(),
		// the topic being subscribed to
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the subscribing user. a team reaches a topic through its members' own rows, never a row of its own
		subscriberUserId: text("subscriber_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// unsubscribing toggles is_active off and keeps the row. only an explicit delete removes it
		isActive: boolean("is_active").notNull().default(true),
		// email cascades off whenever active turns off. it does not cascade back on when active does
		isEmailEnabled: boolean("is_email_enabled").notNull().default(true),
		// delivery preference for this subscriber
		frequency: frequency("frequency").notNull().default("daily"),
		// created and updated timestamps
		...timestamps(),
	},
	// one row per user and topic
	(table) => [
		uniqueIndex("subscriptions_topic_subscriber_unique").on(table.topicId, table.subscriberUserId),
		index("subscriptions_subscriber_active_idx").on(table.subscriberUserId, table.isActive),
	],
)

// one message in a team topic's shared chat room.
// the id is an ordered bigint so a stream reconnect resumes from a cursor
export const chatRoomMessages = pgTable(
	"room_messages",
	{
		id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		// the topic whose chat room this is, and the team whose members are in it.
		// a null topic is the team's own chat room on its team page
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// who wrote it, and the name recorded at post time
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
		authorUsername: text("author_username").notNull(),
		// the message this one answers, which is how a reply to carl continues without a fresh chat mention
		replyToMessageId: bigint("reply_to_message_id", { mode: "number" }),
		// the message text, encrypted at the application layer like the private chat's messages
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the stream and the chat messages both read one chat room in id order
	(table) => [index("room_messages_topic_id_idx").on(table.topicId, table.teamId, table.id)],
)

// who a chat room message mentioned or replied to, extracted at write time, where the content itself is encrypted
export const chatRoomMentions = pgTable(
	"room_mentions",
	{
		// the message and the member it named
		messageId: bigint("message_id", { mode: "number" })
			.notNull()
			.references(() => chatRoomMessages.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// saved when the member loads the chat room, which clears the badge. null is unseen
		seenAt: timestamp("seen_at", { withTimezone: true }),
	},
	// one row per message and member, plus the by-user lookup the chat mention badges read,
	// where the key starts with message
	(table) => [
		primaryKey({ columns: [table.messageId, table.userId] }),
		index("room_mentions_user_id_idx").on(table.userId),
	],
)

// one running summary per chat room, holding what rolled out of the context window and how far it reaches
export const chatRoomSummaries = pgTable(
	"room_summaries",
	{
		id: primaryId(),
		// the chat room is a topic and the team whose members talk in it. a null topic is the team's own chat room
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		summary: text("summary").notNull(),
		// the last message id the summary covers, so the window starts after it
		summarizedThroughMessageId: bigint("summarized_through_message_id", { mode: "number" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one summary per chat room. nulls compare equal here so the team chat room's upsert finds its row
	(table) => [unique("room_summaries_room_unique").on(table.topicId, table.teamId).nullsNotDistinct()],
)

// a chat turn is one question and its reply
export const chatTurns = pgTable(
	"chat_turns",
	{
		id: primaryId(),
		// who asked
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the topic the chat turn is about. null on a team chat room's turn, which names the team instead
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		// the team whose own chat room billed the chat turn, so team spend still counts it. null on a topic chat turn
		teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
		// what the chat turn cost, in the same dollars scans record, summed into the user's monthly spend
		cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
		// the chat turn's text, stored only when the gate grants the sender chat:persist
		question: text("question"),
		answer: text("answer"),
		// the chat room message this turn answered, for a chat room completion. null on a private chat turn
		roomMessageId: bigint("room_message_id", { mode: "number" }),
		// what the completion spent in tokens, kept beside the cost it produced
		totalTokens: integer("total_tokens"),
		// when the chat turn ran. the monthly spend sum uses it and the chat messages replay in its order
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// covers a user's persisted conversation read by topic and time, and the monthly spend sum by user and time
	(table) => [
		index("chat_turns_topic_created_idx").on(table.topicId, table.createdAt),
		index("chat_turns_team_created_idx").on(table.teamId, table.createdAt),
		index("chat_turns_user_created_idx").on(table.userId, table.createdAt),
	],
)

// an attachment a user sent with a chat turn, whether or not they kept it for the topic
export const chatAttachments = pgTable(
	"chat_attachments",
	{
		id: primaryId(),
		// who sent it, and for which topic's conversation. either deletion takes the attachment with it
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topicId: text("topic_id")
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
		// the chat turn it was sent with, which shows it again in that question's bubble
		chatTurnId: text("chat_turn_id").references(() => chatTurns.id, { onDelete: "set null" }),
		// whether the user kept it. a kept attachment counts against the keep limit and carl reads it on later chat turns
		isKept: boolean("is_kept").notNull().default(true),
		kind: chatAttachmentKind("kind").notNull(),
		name: text("name").notNull(),
		// where an image or PDF's original bytes live in object storage. null for text, which has no file
		objectKey: text("object_key"),
		contentType: text("content_type"),
		byteSize: integer("byte_size"),
		// a kept paste or text file's own words, encrypted like a chat turn's text
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

// a file a member shared with the chat room. the uploader clears on account deletion and a leader may still delete it
export const chatRoomAttachments = pgTable(
	"room_attachments",
	{
		id: primaryId(),
		// the chat room the file belongs to, and the message it came with. a message may share several, each its own row
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		messageId: bigint("message_id", { mode: "number" }).notNull(),
		// who shared it, and the name recorded at post time, which outlives the account
		uploaderUserId: text("uploader_user_id").references(() => users.id, { onDelete: "set null" }),
		uploaderUsername: text("uploader_username").notNull(),
		kind: chatAttachmentKind("kind").notNull(),
		name: text("name").notNull(),
		// where an image or PDF's original bytes live in object storage. null for shared text, which has no file
		objectKey: text("object_key"),
		contentType: text("content_type"),
		byteSize: integer("byte_size"),
		// what carl reads on every chat room turn: the document's words or the described image,
		// encrypted like the chat messages
		context: text("context").notNull().default(""),
		status: attachmentStatus("status").notNull().default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the chat room turn and the chat messages both read one chat room's files at once
	(table) => [index("room_attachments_topic_id_idx").on(table.topicId)],
)

// the yjs document bytes column. postgres bytea, which drizzle has no built-in column for
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType() {
		return "bytea"
	},
	// the driver returns a Buffer, which is already a Uint8Array view
	fromDriver(value: Buffer): Uint8Array {
		return value
	},
	toDriver(value: Uint8Array): Buffer {
		return Buffer.from(value)
	},
})

// a note is one named rich-text note on a page, with a visibility: the topic page or the team page it lives on.
// the ydoc is the source of truth for content and comment threads, and the HTML is regenerated from it on save
export const notes = pgTable(
	"notes",
	{
		id: primaryId(),
		// the page, exactly one of the two. deleting the page takes every note with it
		topicId: text("topic_id").references(() => topics.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
		// the note's name in the notes table, and who may see it
		name: text("name").notNull(),
		visibility: noteVisibility("visibility").notNull(),
		// the creator, who alone changes its visibility or deletes it. a private note is visible to this user only
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the yjs document bytes and the stored HTML the static state serves
		ydoc: bytea("ydoc").notNull(),
		html: text("html").notNull().default(""),
		// who wrote the last edit, so a user is never badged for their own
		lastEditorUserId: text("last_editor_user_id").references(() => users.id, { onDelete: "set null" }),
		// when the readable body last changed. updated_at also moves on a comment write and on the HTML regeneration
		bodyEditedAt: timestamp("body_edited_at", { withTimezone: true }),
		...timestamps(),
	},
	(table) => [
		// exactly one page, and one lookup per page
		check("notes_one_page", sql`(${table.topicId} is null) <> (${table.teamId} is null)`),
		index("notes_topic_id_idx").on(table.topicId),
		index("notes_team_id_idx").on(table.teamId),
	],
)

// the sql mirror of a note ydoc's comment threads, for counts and notifications. the ydoc stays the source of truth
export const noteCommentThreads = pgTable(
	"note_comment_threads",
	{
		// the thread id the ydoc's threads map uses
		id: text("id").primaryKey(),
		noteId: text("note_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		// whether the thread is resolved
		isResolved: boolean("is_resolved").notNull().default(false),
		...timestamps(),
	},
	(table) => [index("note_comment_threads_note_id_idx").on(table.noteId)],
)

// the sql mirror of one note comment. the body is the comment's blocknote json
export const noteComments = pgTable(
	"note_comments",
	{
		// the comment id the ydoc thread uses
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => noteCommentThreads.id, { onDelete: "cascade" }),
		// who wrote it. the row outlives a closed account
		authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
		body: jsonb("body"),
		// saved instead of deleting when the ui soft-deletes a comment
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		...timestamps(),
	},
	(table) => [index("note_comments_thread_id_idx").on(table.threadId)],
)

// when a user last opened a note. opening clears the note's unread edit and comment counts
export const noteReads = pgTable(
	"note_reads",
	{
		// the note and the user who opened it
		noteId: text("note_id")
			.notNull()
			.references(() => notes.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// restamped on every open. no row means the note was never opened, so all of it is unread
		readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// one row per note and user, plus the by-user index
	(table) => [primaryKey({ columns: [table.noteId, table.userId] }), index("note_reads_user_id_idx").on(table.userId)],
)

// one link's fetched link preview, keyed by its normalized url so the same link in many chat rooms is fetched once
export const linkPreviews = pgTable(
	"link_previews",
	{
		id: primaryId(),
		// the normalized url this link preview describes
		url: text("url").notNull().unique(),
		// the page's own title and description, encrypted like the message the url was pasted into
		title: text("title"),
		description: text("description"),
		// where the page's proxied image lives in object storage
		imageObjectKey: text("image_object_key"),
		imageContentType: text("image_content_type"),
		// ready holds a fetched link preview. failed records a url that could not be previewed, which stops it being refetched on every post
		status: attachmentStatus("status").notNull(),
		// the team whose message paid for the fetch
		fetchedByTeamId: text("fetched_by_team_id").references(() => teams.id, { onDelete: "set null" }),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
	},
	// the hourly limit counts one team's recent fetches
	(table) => [index("link_previews_team_fetched_idx").on(table.fetchedByTeamId, table.fetchedAt)],
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
	// whether Stripe has a payment method, and how often this subscription bills. only monthly includes metered overage
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

// the created and updated pair with time zones, for the app tables that keep both
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
