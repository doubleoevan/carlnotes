// zod wired contracts for the topic feed payload and its mutations. the api validates with them and the ui parses with them
import { z } from "zod"
import {
	attachmentStatuses,
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
import type { Plan } from "./plans"

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
	interval: z.enum(["monthly", "yearly"]),
})
export type CheckoutPayload = z.infer<typeof checkoutPayload>

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
	scanSummary: string | null
}

// one owned-Topic row on the Activity page, carrying its month Scans for the sub-table
export type ActivityTopic = {
	id: string
	name: string
	// the month-to-date figures and dates the row renders
	monthScanCount: number
	// active subscribers, counted the same way the feed and topic page count them: the owner's own row never counts
	subscriberCount: number
	createdAt: string
	updatedAt: string
	monthCostCents: number
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
// which they do from the topic itself rather than from here
export type InviteRow = {
	topicId: string
	name: string
	inviteeEmail: string
	invitedAt: string
	subscribedAt: string | null
}

// the Activity payload: metered variable spend against the effective budget, owned topics, subscriptions, and invites
export type ActivityResponse = {
	// spend is the recorded Scan-budget figure in cents, null when the proxy has no record to read
	spendCents: number | null
	budgetCents: number
	topics: ActivityTopic[]
	subscriptions: SubscriptionRow[]
	invites: InviteRow[]
}

// the admin role-change body. an admin cannot remove their own admin role, enforced server-side
export const setRolePayload = z.object({ role: z.enum(["admin", "user"]) })
export type SetRolePayload = z.infer<typeof setRolePayload>

// the admin budget-override body: a per-user monthly ceiling in cents, or null to fall back to the plan's backstop
export const budgetOverridePayload = z.object({ budgetOverrideCents: z.number().int().nonnegative().nullable() })
export type BudgetOverridePayload = z.infer<typeof budgetOverridePayload>

// an admin-console user row: the user's standing plus their attributed storage and month-to-date variable cost against budget
export type AdminUserRow = {
	id: string
	email: string
	role: string
	plan: Plan
	createdAt: string
	topicCount: number
	// attributed storage in bytes over globally-deduplicated Resources
	attributedBytes: number
	// month-to-date variable cost in cents. null when the proxy is unreachable
	monthVariableCostCents: number | null
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

// the account page's billing state: the current plan, subscription status for retrying a failed payment, card-on-file, and daily scan usage
export type BillingState = {
	plan: Plan
	// the Stripe subscription status (e.g. active, past_due), or null for a free user with no subscription
	status: string | null
	hasPaymentMethod: boolean
	dailyScansUsed: number
	dailyScanLimit: number
}

// a topic finding. the AI judgment about one Resource under a Topic, plus the user's consumed and bookmarked state
export const topicFinding = z.object({
	findingId: z.string(),
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
	// isOwner gates attachment downloads. newCount is the user's unconsumed count for the "# new" badge
	isOwner: z.boolean(),
	newCount: z.number(),
	// canRate hides the rating control on a topic the user only reads, so it never offers a click the api rejects
	canRate: z.boolean(),
	// whether the requesting user subscribes to this topic
	isSubscribed: z.boolean(),
	// how many subscribers the topic has, shown in the info popover
	subscriberCount: z.number(),
	// schedule shown in the info popover
	createdAt: z.string(),
	lastScanAt: z.string().nullable(),
	// how long the latest succeeded scan took, in milliseconds. null until a scan has succeeded
	lastScanDurationMs: z.number().nullable(),
	// this calendar month's total scan cost in dollars, for the owner (and admins on the topic detail page). null otherwise
	monthCost: z.number().nullable(),
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
	sources: z.array(z.object({ id: z.string(), kind: z.enum(sourceKinds) })),
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
	cost: z.number().nullable(),
	// an AI written recap of the scan. null until the review has run
	scanSummary: z.string().nullable(),
	// why the scan failed, so a topic whose sources all fail does not read as one that simply found nothing
	error: z.string().nullable(),
})
export type TopicScan = z.infer<typeof topicScan>

// a topic's full payload. the topic feed shape plus everything the detail page needs
export const topicResponse = topicFeed.extend({
	visibility: z.enum(visibilities),
	// sources with a display summary derived server side from each source's config
	sources: z.array(z.object({ id: z.string(), kind: z.enum(sourceKinds), summary: z.string() })),
	// the scan history, newest first
	scans: z.array(topicScan),
	// the invited emails. empty for anyone but the owner
	invitees: z.array(z.string()),
	// number of manual scans left today. null for topics the user does not own
	manualScansRemaining: z.number().nullable(),
	// whether the owner has spent their monthly budget, which blocks a scan the same way a used up daily quota does
	isSpendExhausted: z.boolean(),
})
export type TopicResponse = z.infer<typeof topicResponse>

// a source in the update payload. an id keeps that stored source as is, without updating its kind.
// a new source carries its kind and config and is limited to the kinds the editor can add
export const updateTopicSource = z.union([
	z.object({ id: z.string() }),
	z.object({ kind: z.enum(editableSourceKinds), config: z.record(z.string(), z.unknown()) }),
])

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
	// the full invitee and source lists
	invitees: z.array(z.string().trim().toLowerCase().pipe(z.email())),
	sources: z.array(updateTopicSource),
})
export type UpdateTopicPayload = z.infer<typeof updateTopicPayload>

// the subscription toggle body. true subscribes the current user and false unsubscribes them
export const subscriptionPayload = z.object({ isSubscribed: z.boolean() })
export type SubscriptionPayload = z.infer<typeof subscriptionPayload>

// the add-attachment-by-url body. ingestUrlAttachment owns the actual url validation, so this just requires it to be non-empty
export const attachmentUrlPayload = z.object({ url: z.string().trim().min(1) })
export type AttachmentUrlPayload = z.infer<typeof attachmentUrlPayload>

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

// the edited attachment context body. the same cap the worker applies to a generated context, so an edit can't inflate scan tokens
export const MAX_ATTACHMENT_CONTEXT_CHARS = 8000
export const attachmentContextPayload = z.object({ context: z.string().trim().max(MAX_ATTACHMENT_CONTEXT_CHARS) })
export type AttachmentContextPayload = z.infer<typeof attachmentContextPayload>

// the manual scan response which is how many manual scans the user has left today
export const manualScanResponse = z.object({ remaining: z.number() })
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
	// how many more topics the user may create under the topic cap
	topicsRemaining: z.number(),
})
export type TopicFeedResponse = z.infer<typeof topicFeedResponse>

// the create-topic response which is the new topic's id
export const topicCreateResponse = z.object({ id: z.string() })
export type TopicCreateResponse = z.infer<typeof topicCreateResponse>
