// zod wired contracts for the topic feed payload and its mutations. the api validates with them and the ui parses with them
import { z } from "zod"
import {
	editableSourceKinds,
	frequencies,
	ratings,
	resourceKinds,
	scanStatuses,
	sourceKinds,
	topicSectionKeys,
	visibilities,
} from "./enums"

// the rating mutation body. up or down sets the topic finding's rating and null clears it
export const ratingPayload = z.object({ rating: z.enum(ratings).nullable() })
export type RatingPayload = z.infer<typeof ratingPayload>

// the consumed mutation body. true marks the topic finding consumed for the current user and false unmarks it
export const consumedPayload = z.object({ isConsumed: z.boolean() })
export type ConsumedPayload = z.infer<typeof consumedPayload>

// the signup-gate body. oauth never calls this endpoint at all — only the password path needs turnstile
export const signupGatePayload = z.object({ turnstileToken: z.string() })
export type SignupGatePayload = z.infer<typeof signupGatePayload>

// a topic finding. the judgment about one Resource under a Topic, plus the user's isConsumed state
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
	// rating belongs to the topic finding itself. isConsumed is the current user's consumed state
	rating: z.enum(ratings).nullable(),
	isConsumed: z.boolean(),
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
	// isOwner gates attachment downloads. newCount is the user's unconsumed count for the "# new" badge
	isOwner: z.boolean(),
	newCount: z.number(),
	// canRate hides the rating control on a topic the user only reads, so it never offers a click the api rejects
	canRate: z.boolean(),
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
	attachments: z.array(z.object({ id: z.string(), filename: z.string(), sourceUrl: z.string().nullable() })),
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
})
export type TopicScan = z.infer<typeof topicScan>

// a topic's full payload. the topic feed shape plus everything the detail page needs
export const topicResponse = topicFeed.extend({
	visibility: z.enum(visibilities),
	// whether the current user subscribes to this topic
	isSubscribed: z.boolean(),
	// sources with a display summary derived server side from each source's config
	sources: z.array(z.object({ id: z.string(), kind: z.enum(sourceKinds), summary: z.string() })),
	// the scan history, newest first
	scans: z.array(topicScan),
	// the invited emails. empty for anyone but the owner
	invitees: z.array(z.string()),
	// number of manual scans left today. null for topics the user does not own
	manualScansRemaining: z.number().nullable(),
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
	visibility: z.enum(visibilities),
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

// the manual scan response which is how many manual scans the user has left today
export const manualScanResponse = z.object({ remaining: z.number() })
export type ManualScanResponse = z.infer<typeof manualScanResponse>

// the homepage payload. three collapsible sections of topic feeds, plus the user's topic-creation quota
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
