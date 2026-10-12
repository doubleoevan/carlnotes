// the topic contracts: the feed and page payloads, scans, the gate, sources, attachments, and the draft limits
import { z } from "zod"
import {
	attachmentStatuses,
	daysOfWeek,
	editableSourceKinds,
	frequencies,
	scanStatuses,
	sourceKinds,
	topicSectionKeys,
	visibilities,
} from "../enums"
import { customSourceKeys } from "../sources"
import { chatMention } from "./chat"
import { topicFinding } from "./findings"
import { invite } from "./invites"
import { podcastEpisode, podcastEpisodeSummary, publishedPodcastEpisodeSummary, topicPodcast } from "./podcast"
import { profileIdentity } from "./profiles"

// how long a topic prompt may grow before a copy-paste is treated as an attachment
export const TOPIC_PROMPT_CHARS = 2_000

// how long a topic name may be, and how many people one draft may invite
export const TOPIC_NAME_CHARS = 200

export const MAX_DRAFT_INVITES = 20

// how many Sources one topic may hold, the same on every plan.
export const MAX_TOPIC_SOURCES = 10

// the limits on the tags a chat writes onto a topic
export const MAX_TOPIC_DRAFT_TAGS = 10

export const TOPIC_DRAFT_TAG_CHARS = 40

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
	maxTopicFindings: z.number(),
	// the topic owner
	owner: profileIdentity.nullable(),
	// isTopicOwner gates attachment downloads. newCount is the user's unconsumed count for the "# new" badge
	isTopicOwner: z.boolean(),
	newCount: z.number(),
	// whether a team owns the topic
	isOnTeam: z.boolean(),
	// whether the user is an active member of any team holding the topic
	isTeamMember: z.boolean(),
	// the user's unseen chat room mentions, latest first, counted on the name's badge. empty with none
	chatMentions: z.array(chatMention),
	// the byline a team topic derives: the team itself, for anyone who can open its page. the owner otherwise
	teamLink: z
		.object({
			teamId: z.string(),
			name: z.string(),
			// the version of its own uploaded image, or null for the initials and tint drawn from its name and id
			avatarVersion: z.string().nullable(),
		})
		.nullable(),
	// canRate hides the rating row on a topic the user only reads
	canRate: z.boolean(),
	// whether the requesting user subscribes to this topic
	isSubscribed: z.boolean(),
	// how many subscribers the topic has, shown in the info popover
	subscriberCount: z.number(),
	// how many teams hold this topic, shown in the info popover under the follower count
	teamCount: z.number(),
	// the topic visibility, which decides which share options are live
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
	// the attachments and sources shown in the info popover
	attachments: z.array(
		z.object({
			id: z.string(),
			filename: z.string(),
			sourceUrl: z.string().nullable(),
			status: z.enum(attachmentStatuses),
			// the generated context that every later scan uses, for the owner and admins to edit. null for anyone else
			context: z.string().nullable(),
			// what a failed attachment tells the owner and admins. null unless the attachment failed, and null for anyone else
			failureMessage: z.string().nullable(),
		}),
	),
	// topic sources with a display summary derived server side from each source's config
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
	// the latest published podcast episode that the user may listen to, with its chapters.
	// null with none, or on an instance with no speech model
	latestPodcastEpisode: podcastEpisode.nullable(),
})

export type TopicFeed = z.infer<typeof topicFeed>

// a scan in the topic page history
export const topicScan = z.object({
	id: z.string(),
	status: z.enum(scanStatuses),
	// when the scan ran. finishedAt stays null while it is running
	startedAt: z.string(),
	finishedAt: z.string().nullable(),
	// when the user stopped the scan, null for one that ran to the end. a stopped scan is still saved as succeeded
	stoppedAt: z.string().nullable(),
	// what the scan found, kept, and filtered
	foundCount: z.number(),
	keptCount: z.number(),
	filteredCount: z.number(),
	// the scan cost in dollars. null unless the user owns the topic or holds the platform admin role
	costDollars: z.number().nullable(),
	// why the scan failed
	error: z.string().nullable(),
	// the scan's published podcast episode, null if the scan has none or the user may not listen to it
	podcastEpisode: publishedPodcastEpisodeSummary.nullable(),
})

// one scan's recap, loaded per scan instead of returned with the history
export const scanNote = z.object({ scanSummary: z.string().nullable() })

export type TopicScan = z.infer<typeof topicScan>

// a topic's full payload. the topic feed shape plus everything the detail page needs
export const topicResponse = topicFeed.extend({
	visibility: z.enum(visibilities),
	// the topic's podcast, null on an instance with no speech model
	podcast: topicPodcast.nullable(),
	// the scan history, latest first
	scans: z.array(topicScan),
	// the topic's pending invites, both the addresses it named and the links it created. empty for anyone but the owner
	invites: z.array(invite),
	// number of manual scans left today. null for topics the user does not own
	manualScansRemaining: z.number().nullable(),
	// the plan's daily scan limit, which the scan button's tooltip pairs with what is left
	manualScanLimit: z.number().nullable(),
	// whether the owner has spent their monthly budget, which blocks a scan the same way a used up daily quota does
	isSpendExhausted: z.boolean(),
	// whether this user may edit or delete the topic. true for the owner and for any admin
	canEdit: z.boolean(),
	// the team owning this topic, null on a topic no team owns. the page links the team only if reachable
	team: z.object({ teamId: z.string(), name: z.string(), isPublic: z.boolean() }).nullable(),
	// whether the user already asked to join the owning team, which the Join Team button reads
	hasRequestedToJoin: z.boolean(),
	// each holding team the user belongs to, one chat room each, ordered by name
	roomTeams: z.array(z.object({ teamId: z.string(), name: z.string() })),
	// whether the owner holds more daily topics than their plan runs
	isDailyFrequencyPaused: z.boolean(),
	// this topic's position in the Featured section as well as all featured topics, both are null on the topic page
	featureOrder: z.number().nullable(),
	featuredTopics: z.array(z.object({ id: z.string(), name: z.string(), featureOrder: z.number() })).nullable(),
	// up to fifty other topics most related to this one that the user may open, the public shown ones and the ones the
	// user reaches through their account, each with its latest published podcast episode that the user may listen to.
	// empty for a topic with no vector, and on a poll reload
	relatedTopics: z.array(
		z.object({ id: z.string(), name: z.string(), latestPodcastEpisode: podcastEpisodeSummary.nullable() }),
	),
})

export type TopicResponse = z.infer<typeof topicResponse>

// the 403 that a topic page or a podcast episode page responds with to someone who may not see an invite or private
// topic. only an invite topic's gate names the topic
export const topicGateResponse = z.object({
	error: z.literal("forbidden"),
	gatedVisibility: z.enum(visibilities).exclude(["public"]),
	topicName: z.string().nullable().catch(null),
})

export type TopicGateResponse = z.infer<typeof topicGateResponse>

// a source in the update payload
export const updateTopicSource = z.union([
	z.object({ id: z.string() }),
	z.object({ sourceKind: z.enum(editableSourceKinds), config: z.record(z.string(), z.unknown()) }),
])

// the attachment context limit. a document this short is stored as written, and a longer one is summarized to fit
export const MAX_ATTACHMENT_CONTEXT_CHARS = 20_000

// the reason that the attachment workflow records for a file with no text, and the start of a flagged file's reason
export const ATTACHMENT_NO_TEXT_REASON = "the file held no readable text"

export const SCANNER_FLAGGED_REASON_PREFIX = "flagged by the scanner"

/**
 * Returns what a failed attachment tells its owner, from the reason that the attachment workflow recorded.
 */

export function toAttachmentFailureMessage(failureReason: string | null): string {
	// a file with no text to read, then a file that the scanner flagged, then any other failure
	if (failureReason === ATTACHMENT_NO_TEXT_REASON) {
		return "Carl found no text in this file, like a scanned PDF. Attach a copy whose text can be selected."
	}
	if (failureReason?.startsWith(SCANNER_FLAGGED_REASON_PREFIX)) {
		return "Carl's safety check flagged this file, so Carl won't read it."
	}
	return "Carl couldn't read this one."
}

// suggested sources, each already confirmed readable. name is the display name for the source
export const suggestSourcesResponse = z.object({
	sources: z.array(
		z.object({ sourceOption: z.enum(customSourceKeys), value: z.string(), name: z.string().optional() }),
	),
})

export type SuggestSourcesResponse = z.infer<typeof suggestSourcesResponse>

// the manual scan response which is how many manual scans the user has left today
export const manualScanResponse = z.object({ remainingScans: z.number() })

// the homepage payload. the collapsible sections of topic feeds, plus the user's topic-creation quota
export const topicFeedResponse = z.object({
	// each section pairs its key with its topic feeds
	sections: z.array(
		z.object({
			key: z.enum(topicSectionKeys),
			topics: z.array(topicFeed),
		}),
	),
	// how many topics the user can still create under their plan's topic limit
	topicsRemaining: z.number(),
	// the plan's topic limit, which the New Topic button pairs with what is left
	topicLimit: z.number(),
	// how many topics the plan can run on a daily frequency, and how many of those slots are still free
	dailyTopicLimit: z.number(),
	dailyTopicsRemaining: z.number(),
})

export type TopicFeedResponse = z.infer<typeof topicFeedResponse>

// the create-topic response which is the new topic's id
export const topicCreateResponse = z.object({ id: z.string() })

// a public topic as the sitemap and llms.txt list it
export type PublicTopic = {
	id: string
	name: string
	description: string
	// when the topic last gained a finding, or when the topic was created if it has no finding, as an ISO string
	feedUpdatedAt: string
}

// the key of one homepage topic section
export type TopicSectionKey = (typeof topicSectionKeys)[number]
