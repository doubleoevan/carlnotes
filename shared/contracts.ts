// zod wired contracts for the topic feed payload and its mutations. the api validates with them and the ui parses with them
import { z } from "zod"
import { frequencies, ratings, resourceKinds, sourceKinds, topicSectionKeys } from "./enums"

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
	// ai generated recap of the latest scan. null until a scan has succeeded
	scanSummary: z.string().nullable(),
	// the attachments and sources shown in the info popover. attachments can only be downloaded by the topic owner
	attachments: z.array(z.object({ id: z.string(), filename: z.string() })),
	sources: z.array(z.object({ id: z.string(), kind: z.enum(sourceKinds) })),
	findings: z.array(topicFinding),
})
export type TopicFeed = z.infer<typeof topicFeed>

// the homepage payload. three collapsible sections of topic feeds
export const topicFeedResponse = z.object({
	// each section pairs its key with its topic feeds
	sections: z.array(
		z.object({
			key: z.enum(topicSectionKeys),
			topics: z.array(topicFeed),
		}),
	),
})
export type TopicFeedResponse = z.infer<typeof topicFeedResponse>
