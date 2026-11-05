// topic routing results contain destination metadata without the private send body
import { z } from "zod"
import { visibilities } from "./enums"
import { podcastEpisodeSummary } from "./podcast"

export const TOPIC_SUGGESTIONS_PAGE_SIZE = 5
export const START_TOPIC_DRAFT_LABEL = "Start a new topic for this chat"

// both the picker and text clients read the same ranked destinations
const suggestedTopic = z.object({
	id: z.string(),
	name: z.string(),
	prompt: z.string(),
	url: z.string(),
	group: z.enum(["editable", "public_to_follow"]),
	relevance: z.number(),
	visibility: z.enum(visibilities).optional(),
	teamName: z.string().nullable().optional(),
	subscriberCount: z.number().int().nonnegative().optional(),
	viewerCount: z.number().int().nonnegative().optional(),
	latestPodcastEpisode: podcastEpisodeSummary.nullable().optional(),
	weeklyFindingCount: z.number().int().nonnegative().optional(),
	isBestMatch: z.boolean().optional(),
})
export type SuggestedTopic = z.infer<typeof suggestedTopic>
export const topicSuggestionsResult = z.discriminatedUnion("status", [
	z.object({ status: z.literal("unavailable") }),
	z.object({
		status: z.literal("suggested"),
		editableTopics: z.array(suggestedTopic),
		publicTopicsToFollow: z.array(suggestedTopic),
		nextCursor: z.string().nullable(),
		pageCount: z.number().int().positive().optional(),
		pageCursors: z.record(z.string(), z.string()).optional(),
		routeTopicId: z.string().nullable().optional(),
		newPrivateTopic: z.object({ label: z.string(), instructions: z.string() }).optional(),
	}),
])
export type TopicSuggestionsResult = z.infer<typeof topicSuggestionsResult>

/**
 * Renders numbered choices for hosts that display no MCP App card.
 */
export function toTopicSuggestionsText(result: TopicSuggestionsResult): string {
	if (result.status === "unavailable") {
		return "Topic matching is unavailable. Nothing was saved. Choose a Topic explicitly or try again later."
	}
	// number editable destinations before the explicit new-Topic choice
	let topicNumber = 0
	const describeTopic = (topic: SuggestedTopic): string =>
		`${++topicNumber}. ${topic.name}${topic.isBestMatch ? " (best match)" : ""} — ${topic.id} — ${topic.url}`
	const editableLines = result.editableTopics.map(describeTopic)
	return [
		"Your editable topics",
		...(editableLines.length ? editableLines : ["No editable topics."]),
		"Choose one or more editable topic numbers to send this chat once.",
		...(result.newPrivateTopic
			? [`${++topicNumber}. ${START_TOPIC_DRAFT_LABEL}. ${result.newPrivateTopic.instructions}`]
			: []),
		...(result.nextCursor
			? [`More topics: repeat suggest_topics with the same content, search, and cursor ${result.nextCursor}.`]
			: []),
		...(result.routeTopicId
			? [`This connection can send only to ${result.routeTopicId}. Use /mcp for multiple topics.`]
			: []),
	].join("\n")
}
