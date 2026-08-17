// zod wired contracts for the topic feed payload and its mutations. the api validates with them and the ui parses with them
import { z } from "zod"
import {
	attachmentStatuses,
	type chatAttachmentKinds,
	daysOfWeek,
	editableSourceKinds,
	frequencies,
	maxResultsOptions,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	topicSectionKeys,
	visibilities,
} from "./enums"
import type { BillingInterval, Plan } from "./plans"
import { customSourceKeys } from "./sources"

// the rating mutation body. up or down sets the topic finding's rating and null clears it
export const ratingPayload = z.object({ rating: z.enum(ratings).nullable() })
export type RatingPayload = z.infer<typeof ratingPayload>

// the consumed mutation body. true marks the topic finding consumed for the current user and false unmarks it
export const consumedPayload = z.object({ isConsumed: z.boolean() })
export type ConsumedPayload = z.infer<typeof consumedPayload>

// the bookmark mutation body. true sets the topic finding bookmark for the current user and false releases it
export const bookmarkPayload = z.object({ isBookmarked: z.boolean() })
export type BookmarkPayload = z.infer<typeof bookmarkPayload>

// the signup-gate body. oauth never calls this endpoint at all — only the password path needs turnstile
export const signupGatePayload = z.object({ turnstileToken: z.string() })
export type SignupGatePayload = z.infer<typeof signupGatePayload>

// the checkout body. which paid plan and billing interval to subscribe to through Stripe Checkout
export const checkoutPayload = z.object({
	plan: z.enum(["plus", "premium"]),
	billingInterval: z.enum(["monthly", "yearly"]),
})
export type CheckoutPayload = z.infer<typeof checkoutPayload>

// the update username body. the validation rules live in toUsernameRejection
export const usernamePayload = z.object({ username: z.string() })
export type UsernamePayload = z.infer<typeof usernamePayload>

// how long a flag's reason may run. it is a note to a person, not a case file
export const FLAG_REASON_MAX_CHARS = 1000

// the flag content body. the subject is a Topic id or a username, named by which kind it is so the api can look it up
export const flagContentPayload = z.object({
	subjectKind: z.enum(["topic", "profile"]),
	subjectId: z.string().min(1),
	reason: z.string().trim().min(1).max(FLAG_REASON_MAX_CHARS),
})
export type FlagContentPayload = z.infer<typeof flagContentPayload>

// the invite-revoke body. which invitee the topic owner is withdrawing, named by the address they invited
export const inviteRevokePayload = z.object({ email: z.string() })
export type InviteRevokePayload = z.infer<typeof inviteRevokePayload>

// the subscription email-preference mutation body which is independent of the subscription's active state
export const subscriptionEmailPayload = z.object({ isEmailEnabled: z.boolean() })
export type SubscriptionEmailPayload = z.infer<typeof subscriptionEmailPayload>

// one Scan row in an Activity topic's drill-down. finishedAt and scanSummary for the scan-notes popover
export type ActivityScan = {
	id: string
	// the outcome and, for a failed scan, the recorded reason
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	// what the scan found, kept, and cost
	foundCount: number
	keptCount: number
	costCents: number
}

// one owned-Topic row on the Activity page, carrying its month Scans for the sub-table
export type ActivityTopic = {
	id: string
	name: string
	// who may see the topic, shown with the same glyph the topic page's info card uses
	visibility: (typeof visibilities)[number]
	// the topic scan schedule: daily, weekdays, or weekly
	frequency: (typeof frequencies)[number]
	// the month-to-date figures and dates the row renders
	monthScanCount: number
	// active subscribers, counted the same way the feed and topic page count them: the owner's own row never counts
	subscriberCount: number
	createdAt: string
	updatedAt: string
	monthCostCents: number
	// how many emails the topic sent this month that resend accepted
	monthEmailCount: number
	// the owner's own subscription decides whether this topic emails them
	isEmailEnabled: boolean
	scans: ActivityScan[]
}

// one row of the Activity page's subscriptions table, kept until manually deleted. an invite stays inactive until the recipient activates it
export type SubscriptionRow = {
	topicId: string
	name: string
	ownerName: string
	// an invite topic only shows findings from the next scan onward, which reactivating has to say out loud
	visibility: (typeof visibilities)[number]
	subscribedAt: string
	isActive: boolean
	isEmailEnabled: boolean
	// the audience that granted this subscription, or null when the user subscribed directly. an audience-held
	// row is read-only, since every subscription write is scoped to the caller's own direct row
	audienceName: string | null
}

// an invitation the user sent on a topic they own. subscribedAt is null until the invitee subscribes,
// which they can do from their own subscriptions table
export type InviteRow = {
	topicId: string
	name: string
	inviteeEmail: string
	// the invitee's account if the invited address has one, for the table's avatar and profile link
	invitee: ProfileIdentity | null
	invitedAt: string
	subscribedAt: string | null
}

// the user identity for a profile page link
export type ProfileIdentity = { userId: string; username: string; avatarSource: string | null }

// the Activity payload: whose it is, metered variable spend against the effective budget, owned topics,
// subscriptions, and invites
export type ActivityResponse = {
	// whose activity this is: the user's own, or the user an admin is viewing
	user: ProfileIdentity
	// this month's spend in cents, split by what scans and chat so that the meter can show the two apart.
	scanSpendCents: number
	chatSpendCents: number
	budgetCents: number
	topics: ActivityTopic[]
	subscriptions: SubscriptionRow[]
	invites: InviteRow[]
}

// how much conversation the model holds word for word, about twenty typical chat turns
// it is a character budget that the count of chat turns cannot price
export const CHAT_MEMORY_CHARS = 40_000

/**
 * Where the uncompacted chat turns start, walking back from the newest turn until the character budget runs out.
 */
export function toUncompactedChatTurnStart(history: { question: string; answer: string }[]): number {
	// spend the budget newest-first
	let budget = CHAT_MEMORY_CHARS
	for (let index = history.length - 1; index >= 0; index--) {
		const chatTurn = history[index]
		budget -= (chatTurn?.question.length ?? 0) + (chatTurn?.answer.length ?? 0)

		// the chat turn that overdraws the budget is the first compacted one, unless it is the newest
		if (budget < 0) {
			return Math.min(index + 1, history.length - 1)
		}
	}
	return 0
}

// how many chat turns a send posts to the llm: the limit is what the model can read before our code compacts
export const CHAT_HISTORY_TURNS = 100

// how much of a compacted older answer survives: enough to carry its summary, cheap enough to keep many
const COMPACT_ANSWER_CHARS = 280

/**
 * An older answer compacted to its opening characters, so the payload and the prompt clip identically.
 */
export function compactChatAnswer(answer: string): string {
	if (answer.length <= COMPACT_ANSWER_CHARS) {
		return answer
	}
	return `${answer.slice(0, COMPACT_ANSWER_CHARS).trimEnd()}…`
}

// how many attachments one chat turn may carry, and how large each may run.
// an image is stored as a data url, whose character cap works out to about 4.5MB of binary, and text is clipped to the same cap
export const CHAT_MAX_ATTACHMENTS = 4
export const CHAT_ATTACHMENT_TEXT_CHARS = 50_000
export const CHAT_IMAGE_DATA_CHARS = 6_000_000

// how long a question may run, shared by the payload cap and the draft box.
// a copy-paste that would push the draft past it becomes a text attachment chip instead
export const CHAT_QUESTION_CHARS = 1_000

// how long a topic prompt may grow before a copy-paste is treated as an attachment
export const TOPIC_PROMPT_CHARS = 2_000

// how many attachments one user may keep durably against one topic.
// a keep past the cap is skipped silently, because it runs after the chat turn that asked for it has already finished
export const CHAT_ATTACHMENT_KEEP_LIMIT = 20

// the shape that every chat attachment includes whatever its kind. keep is only set to false beyond the chat attachment keep limit
const chatAttachmentFields = {
	name: z.string().trim().min(1).max(200),
	keep: z.boolean().default(false),
}

// one attachment on a chat turn. each kind has its own field requirements
// a caller holding a validated attachment never has to guess whether a field is present
export const chatAttachmentPayload = z.discriminatedUnion("kind", [
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("image"),
		dataUrl: z.string().max(CHAT_IMAGE_DATA_CHARS).startsWith("data:image/"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("pdf"),
		dataUrl: z.string().max(CHAT_IMAGE_DATA_CHARS).startsWith("data:application/pdf"),
	}),
	z.strictObject({
		...chatAttachmentFields,
		kind: z.literal("text"),
		text: z.string().max(CHAT_ATTACHMENT_TEXT_CHARS),
	}),
])
export type ChatAttachment = z.infer<typeof chatAttachmentPayload>

/**
 * Attachment text is held to a cap, with a marker naming the cut so that a reply does not invent a reason the document ends early.
 */
export function clipAttachmentText(text: string): string {
	if (text.length <= CHAT_ATTACHMENT_TEXT_CHARS) {
		return text
	}
	const marker = `\n\n[The attachment is cut here. It runs ${text.length.toLocaleString("en-US")} characters and only the first ${CHAT_ATTACHMENT_TEXT_CHARS.toLocaleString("en-US")} are included.]`
	return `${text.slice(0, CHAT_ATTACHMENT_TEXT_CHARS - marker.length)}${marker}`
}

/**
 * A question with its attachments named in a trailing note, so a later replay reads like the original version
 */
export function withAttachmentNote(question: string, attachments: { name: string }[]): string {
	if (attachments.length === 0) {
		return question
	}
	return `${question}\n\n[attached: ${attachments.map((attachment) => attachment.name).join(", ")}]`
}

// a chat turn's question plus the conversation so far.
// the client sends the history and every string is capped so that one request cannot inflate the prompt
export const chatTurnPayload = z.object({
	question: z.string().trim().min(1).max(CHAT_QUESTION_CHARS),
	history: z
		.array(z.object({ question: z.string().max(1000), answer: z.string().max(6000) }))
		.max(CHAT_HISTORY_TURNS)
		.default([]),
	attachments: z.array(chatAttachmentPayload).max(CHAT_MAX_ATTACHMENTS).default([]),
})
export type ChatTurnPayload = z.infer<typeof chatTurnPayload>

// one persisted chat turn of a stored conversation, replayed on a later page load.
// `at` is when the chat turn ran. it is returned by a response but absent on the history that a send posts
export type ChatTurnRow = { question: string; answer: string; at?: string }

// an attachment the user keeps durably for a topic
export type KeptChatAttachment = { id: string; name: string; kind: (typeof chatAttachmentKinds)[number] }

// the stored conversation for a topic. canChat gates sending and isSignupRequired flags a signed-out visitor
// the kept attachments are what the chat composer lists and counts against the cap
export type ChatConversation = {
	chatTurns: ChatTurnRow[]
	canChat: boolean
	isSignupRequired: boolean
	// an exhausted monthly budget keeps the panel open on the upgrade link instead of hiding chat
	isBudgetExhausted: boolean
	keptAttachments: KeptChatAttachment[]
}

// the admin role-change body. an admin cannot remove their own admin role, enforced server-side
export const setRolePayload = z.object({ role: z.enum(["admin", "user"]) })
export type SetRolePayload = z.infer<typeof setRolePayload>

// the admin budget-override body: a per-user monthly limit in cents, or null to fall back to the plan's backstop
export const budgetOverridePayload = z.object({ budgetOverrideCents: z.number().int().nonnegative().nullable() })
export type BudgetOverridePayload = z.infer<typeof budgetOverridePayload>

// an admin-console user row: the user's standing plus their attributed storage and month-to-date variable cost against budget
export type AdminUserRow = {
	id: string
	email: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	role: string
	plan: Plan
	createdAt: string
	topicCount: number
	// attributed storage in bytes over globally-deduplicated Resources
	attributedBytes: number
	// month-to-date variable cost in cents. null when the proxy is unreachable
	monthVariableCostCents: number | null
	// the app's own month-to-date totals in cents, split by what produced them
	scanSpendCents: number
	chatSpendCents: number
	// the per-user override in cents (null means the plan value), and the resulting effective monthly budget
	budgetOverrideCents: number | null
	effectiveBudgetCents: number
}

// the admin-console totals: platform-wide storage and variable cost, Stripe net revenue, and the derived contribution
export type AdminTotals = {
	attributedBytes: number
	monthVariableCostCents: number
	// Stripe's reporting/balance figure that already nets refunds, proration, and fees. null when unavailable
	netRevenueCents: number | null
	// net revenue minus tracked variable cost and an optional fixed cost
	contributionCents: number | null
}

// the admin-console payload: the users table and the totals summary
export type AdminConsoleResponse = { users: AdminUserRow[]; totals: AdminTotals }

// one row in a profile page's topic table. subscriberCount is by Topic, which the footer sums
export type ProfileTopic = {
	id: string
	name: string
	// who may see the topic
	visibility: (typeof visibilities)[number]
	// when the Topic was created and last updated
	createdAt: string
	updatedAt: string
	// findings kept and resources seen, summed across every succeeded Scan the Topic has run
	keptCount: number
	seenCount: number
	subscriberCount: number
}

// a user profile search result
export type UserSearchResult = {
	userId: string
	username: string
	avatarSource: string
}

// how long a query must be before it can search users, and how many matches can be returned
export const USER_SEARCH_MIN_CHARS = 2
export const USER_SEARCH_LIMIT = 5

export type ProfileResponse = {
	// the avatar's tint is seeded from the user id, so the id is included with the profile
	userId: string
	username: string
	// where the avatar comes from. oauth provider, uploaded by user, or generated username initials
	avatarSource: string
	joinedAt: string
	// distinct people, not summed rows. the same person following multiple Topics counts once here
	subscriberCount: number
	// whether the topics below include the user's private and invite ones, which only the owner and an admin view
	includesNonPublicTopics: boolean
	topics: ProfileTopic[]
}

// the account page's billing state: the current plan and how often it bills,
// payment status for retrying a failed payment, card-on-file, and daily scan usage
export type BillingState = {
	plan: Plan
	// how often the subscription bills. a free user has none and reads monthly for limit lookups
	billingInterval: BillingInterval
	// the Stripe payment status (e.g. active, past_due), or null for a free user with no subscription
	status: string | null
	hasPaymentMethod: boolean
	dailyScansUsed: number
	dailyScanLimit: number
}

// a topic finding. the AI judgment about one Resource under a Topic, plus the user's consumed and bookmarked state
export const topicFinding = z.object({
	findingId: z.string(),
	// the topic scan that produced the finding, so a topic scan's diary can list its own findings
	scanId: z.string(),
	resourceId: z.string(),
	url: z.string(),
	// the kind of the resource this finding points at, not a kind of finding
	resourceKind: z.enum(resourceKinds),
	title: z.string().nullable(),
	// shown in the metadata. source is the url's host, and publishedAt is the resource's creation time standing in for a publish date
	source: z.string().nullable(),
	publishedAt: z.string().nullable(),
	// when the resource was fetched, and how many times it's been opened
	fetchedAt: z.string(),
	viewCount: z.number(),
	// the model's judgment. the relevance score and a short explanation of why
	relevanceScore: z.number(),
	relevanceExplanation: z.string(),
	// rating belongs to the topic finding itself. isConsumed and isBookmarked are the current user's states
	rating: z.enum(ratings).nullable(),
	isConsumed: z.boolean(),
	isBookmarked: z.boolean(),
	// the resource's captured engagement score, like a reddit score. null when no ingester recorded one
	engagement: z.number().nullable(),
})
export type TopicFinding = z.infer<typeof topicFinding>

// a topic feed. one Topic's header fields plus its topic finding rows
export const topicFeed = z.object({
	id: z.string(),
	name: z.string(),
	// the prompt for the topic. the design keeps it separate from the topic name
	prompt: z.string(),
	tags: z.array(z.string()),
	frequency: z.enum(frequencies),
	// the time of day that a scan runs, "HH:MM" 24-hour. scheduledDayOfWeek only matters when frequency is weekly
	scheduledTime: z.string(),
	scheduledDayOfWeek: z.enum(daysOfWeek),
	// how many findings a scan is set to keep for this topic
	maxResults: z.number(),
	// the topic owner
	owner: z.object({ userId: z.string(), username: z.string(), avatarSource: z.string() }).nullable(),
	// isOwner gates attachment downloads. newCount is the user's unconsumed count for the "# new" badge
	isOwner: z.boolean(),
	newCount: z.number(),
	// canRate hides the rating control on a topic the user only reads, so it never offers a click the api rejects
	canRate: z.boolean(),
	// whether the requesting user subscribes to this topic
	isSubscribed: z.boolean(),
	// how many subscribers the topic has, shown in the info popover
	subscriberCount: z.number(),
	// the topic visibility which determines whether to show the share button
	visibility: z.enum(visibilities),
	// schedule shown in the info popover
	createdAt: z.string(),
	lastScanAt: z.string().nullable(),
	// how long the latest succeeded scan took, in milliseconds. null until a scan has succeeded
	lastScanDurationMs: z.number().nullable(),
	// this calendar month's total scan cost in dollars, for the owner (and admins on the topic detail page). null otherwise
	monthCostDollars: z.number().nullable(),
	// an AI generated recap of the latest scan. null until a scan has succeeded
	scanSummary: z.string().nullable(),
	// the attachments and sources shown in the info popover. a file attachment downloads for the owner, a url attachment links out to its page
	attachments: z.array(
		z.object({
			id: z.string(),
			filename: z.string(),
			sourceUrl: z.string().nullable(),
			status: z.enum(attachmentStatuses),
			// the generated context that steers every later scan, for the owner and admins to edit. null for anyone else
			context: z.string().nullable(),
		}),
	),
	// topic sources with a display summary derived server side from each source's config.
	// only the owner can see a pending or failed attachment status
	sources: z.array(
		z.object({
			id: z.string(),
			sourceKind: z.enum(sourceKinds),
			summary: z.string(),
			// what the source is identified by, which is what a suggestion is deduped against
			value: z.string(),
			status: z.enum(attachmentStatuses),
			error: z.string().nullable(),
		}),
	),
	findings: z.array(topicFinding),
})
export type TopicFeed = z.infer<typeof topicFeed>

// a scan in the topic page history
export const topicScan = z.object({
	id: z.string(),
	status: z.enum(scanStatuses),
	// when the scan ran. finishedAt stays null while it is running
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	// what the scan found, kept, and filtered
	foundCount: z.number(),
	keptCount: z.number(),
	filteredCount: z.number(),
	// the scan cost in dollars. null unless the viewer owns the topic or holds the platform admin role
	costDollars: z.number().nullable(),
	// why the scan failed, so a topic whose sources all fail does not read as one that simply found nothing
	error: z.string().nullable(),
})

// one scan's recap, loaded per scan instead of riding along with the history
export const scanNote = z.object({ scanSummary: z.string().nullable() })
export type TopicScan = z.infer<typeof topicScan>

// a topic's full payload. the topic feed shape plus everything the detail page needs
export const topicResponse = topicFeed.extend({
	visibility: z.enum(visibilities),
	// the scan history, newest first
	scans: z.array(topicScan),
	// the invited emails. empty for anyone but the owner
	invitees: z.array(z.string()),
	// number of manual scans left today. null for topics the user does not own
	manualScansRemaining: z.number().nullable(),
	// whether the owner has spent their monthly budget, which blocks a scan the same way a used up daily quota does
	isSpendExhausted: z.boolean(),
	// whether this user may edit or delete the topic. true for the owner and for any admin
	canEdit: z.boolean(),
	// whether the owner holds more daily topics than their plan runs
	isDailyFrequencyPaused: z.boolean(),
	// this topic's position in the Featured section as well as all featured topics,
	// both are null on the topic page for anyone but an admin, who is the only one who can see or set them
	featureOrder: z.number().nullable(),
	featuredTopics: z.array(z.object({ id: z.string(), name: z.string(), featureOrder: z.number() })).nullable(),
})
export type TopicResponse = z.infer<typeof topicResponse>

// how many Sources one topic may hold, the same on every plan.
export const MAX_TOPIC_SOURCES = 10

// a source in the update payload. an id keeps that stored source as is, without updating its sourceKind.
// a new source includes its sourceKind and config, limited to the kinds the editor can add
export const updateTopicSource = z.union([
	z.object({ id: z.string() }),
	z.object({ sourceKind: z.enum(editableSourceKinds), config: z.record(z.string(), z.unknown()) }),
])

// the cap the worker applies to a generated attachment context, so an edit can't inflate scan tokens
export const MAX_ATTACHMENT_CONTEXT_CHARS = 8000

// the source suggestions body. the topic's context is included in the request.
// excludeSources are sources that the editor already has
export const suggestSourcesPayload = z.object({
	name: z.string().trim(),
	prompt: z.string().trim(),
	attachmentContext: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS).default(""),
	excludeSources: z
		.array(z.object({ sourceOption: z.enum(customSourceKeys), value: z.string() }))
		.max(MAX_TOPIC_SOURCES),
	limit: z.number().int().min(1).max(MAX_TOPIC_SOURCES),
})
export type SuggestSourcesPayload = z.infer<typeof suggestSourcesPayload>

// suggested sources, each already confirmed readable. name is the display name for the source
export const suggestSourcesResponse = z.object({
	sources: z.array(
		z.object({ sourceOption: z.enum(customSourceKeys), value: z.string(), name: z.string().optional() }),
	),
})
export type SuggestSourcesResponse = z.infer<typeof suggestSourcesResponse>

// the topic update body the edit modal saves. invitees and sources are lists that the api reconciles
export const updateTopicPayload = z.object({
	// the editable topic fields
	name: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	tags: z.array(z.string().trim().min(1)),
	frequency: z.enum(frequencies),
	scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM"),
	scheduledDayOfWeek: z.enum(daysOfWeek),
	visibility: z.enum(visibilities),
	// how many findings a scan is set to keep for this topic
	maxResults: z.number().refine((value) => (maxResultsOptions as readonly number[]).includes(value)),
	// the full list of a topic's invitees
	invitees: z.array(z.string().trim().toLowerCase().pipe(z.email())),
	// stored, staged, and prompt-derived Sources are combined into one array and limited to MAX_TOPIC_SOURCES
	sources: z.array(updateTopicSource).max(MAX_TOPIC_SOURCES),
})
export type UpdateTopicPayload = z.infer<typeof updateTopicPayload>

// the subscription toggle body. true subscribes the current user and false unsubscribes them
export const subscriptionPayload = z.object({ isSubscribed: z.boolean() })
export type SubscriptionPayload = z.infer<typeof subscriptionPayload>

// which signup button converted, kept in a cookie so it survives the oauth round-trip. the ui writes it, so it cannot live in shared/analytics
export const SIGNUP_CTA_COOKIE_NAME = "signup_cta"

// the allowed shape of a cta tag: a short slug, so nothing user-typed or tampered ever becomes an event property
const CTA_TAG_PATTERN = /^[a-z0-9-]{1,40}$/

/**
 * The cta value when it is a well-formed tag, else null, so a garbled cookie never reaches analytics.
 */
export function toCtaTag(value: string | null | undefined): string | null {
	return value && CTA_TAG_PATTERN.test(value) ? value : null
}

// the edited attachment context body
export const attachmentContextPayload = z.object({ context: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS) })
export type AttachmentContextPayload = z.infer<typeof attachmentContextPayload>

// the payload for attaching a page by url. the shape is checked here and the url itself
// which rejects a malformed, non-http, or internal url and names the reason
export const attachmentUrlPayload = z.object({ url: z.string().trim().min(1).max(2000) })
export type AttachmentUrlPayload = z.infer<typeof attachmentUrlPayload>

// the admin's featured topics order choice
export const topicFeatureOrderPayload = z.object({ position: z.number().int().min(0) })
export type TopicFeatureOrderPayload = z.infer<typeof topicFeatureOrderPayload>

// the manual scan response which is how many manual scans the user has left today
export const manualScanResponse = z.object({ remainingScans: z.number() })
export type ManualScanResponse = z.infer<typeof manualScanResponse>

// the homepage payload. the collapsible sections of topic feeds, plus the user's topic-creation quota
export const topicFeedResponse = z.object({
	// each section pairs its key with its topic feeds
	sections: z.array(
		z.object({
			key: z.enum(topicSectionKeys),
			topics: z.array(topicFeed),
		}),
	),
	// how topics the user can still create under their plan's topic limit
	topicsRemaining: z.number(),
	// how many topics the plan can run on a daily frequency, and how many of those slots are still free
	dailyTopicLimit: z.number(),
	dailyTopicsRemaining: z.number(),
})
export type TopicFeedResponse = z.infer<typeof topicFeedResponse>

// the create-topic response which is the new topic's id
export const topicCreateResponse = z.object({ id: z.string() })
export type TopicCreateResponse = z.infer<typeof topicCreateResponse>
