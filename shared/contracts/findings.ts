// the topic finding contract: the review about one resource under a topic, with the user's marks on it
import { z } from "zod"
import { ratings, resourceKinds } from "../enums"
import { profileIdentity } from "./profiles"

// a topic finding. the AI review about one Resource under a Topic, plus the user's consumed and bookmarked state
export const topicFinding = z.object({
	findingId: z.string(),
	// the topic scan that produced the finding, so the scan history can list each scan's own findings
	scanId: z.string(),
	resourceId: z.string(),
	url: z.string(),
	// the kind of the resource this finding points at, not a kind of finding
	resourceKind: z.enum(resourceKinds),
	title: z.string().nullable(),
	// shown in the metadata, and the path this origin serves the source host's favicon from, null when it has none
	source: z.string().nullable(),
	faviconPath: z.string().nullable(),
	publishedAt: z.string().nullable(),
	// when the resource was fetched, and how many times it's been opened
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
	// the resource's captured engagement score, like a reddit score. null if no ingester recorded one
	engagement: z.number().nullable(),
})

export type TopicFinding = z.infer<typeof topicFinding>
