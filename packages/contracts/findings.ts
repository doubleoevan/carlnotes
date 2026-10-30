// the topic finding contract: the review about one resource under a topic, with the user's marks on it
import { z } from "zod"
import { ratings, resourceKinds } from "./enums"
import { profileIdentity } from "./profiles"
import { displayEnum } from "./tolerantReads"

// a topic finding. the AI review about one Resource under a Topic, plus the user's consumed and bookmarked state
export const topicFinding = z.object({
	findingId: z.string(),
	// the topic scan that produced the finding, so the scan history can list each scan's own findings
	scanId: z.string(),
	resourceId: z.string(),
	url: z.string(),
	// the kind of the resource this finding points at, not a kind of finding
	resourceKind: displayEnum(resourceKinds),
	title: z.string().nullable(),
	// shown in the metadata, and the path this origin serves the source host's favicon from, null when it has none
	source: z.string().nullable(),
	faviconPath: z.string().nullable(),
	publishedAt: z.string().nullable(),
	// when the resource was fetched, and how many times the finding has been opened
	fetchedAt: z.string(),
	viewCount: z.number(),
	// the model's review. the relevance score and a short explanation of why
	relevanceScore: z.number(),
	relevanceExplanation: z.string(),
	// rating belongs to the topic finding itself. isConsumed and isBookmarked are the current user's states
	rating: z.enum(ratings).nullable(),
	isConsumed: z.boolean(),
	isBookmarked: z.boolean(),
	// the teammates who bookmarked this finding, for the Bookmarked view's Team scope. empty off a team
	teamBookmarks: z.array(profileIdentity).default([]),
})

export type TopicFinding = z.infer<typeof topicFinding>

// the feed sort modes, which the search sorts by too. all three are read-side orderings, never persisted
export const TOPIC_FINDING_SORTS = ["relevant", "newest", "trending"] as const

export type TopicFindingSort = (typeof TOPIC_FINDING_SORTS)[number]

// the filter views, which the search filters findings by too. unread narrows to the user's unread findings, and
// bookmarked to the user's bookmarked findings. no view shows a finding rated thumbs down
export const TOPIC_FINDING_FILTERS = ["all", "unread", "bookmarked"] as const

export type TopicFindingFilter = (typeof TOPIC_FINDING_FILTERS)[number]

// how selected tags filter: a topic with any of them, all of them, none of them, or off to ignore the tags
export const TAG_MATCH_MODES = ["any", "all", "none", "off"] as const

export type TagMatchMode = (typeof TAG_MATCH_MODES)[number]
