import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useQuery } from "@tanstack/react-query"

// how long a reopened Finding reuses its topic's byline and image without another read
const FINDING_TOPIC_STALE_MS = 60_000

// the parts of a Finding's topic that its note shows beside the topic's name
export type FindingTopicFields = Pick<TopicResponse, "owner" | "teamLink" | "image">

/**
 * Returns the byline and image of a Finding's topic, and whether the read is in progress. A caller that already has
 * them, such as a topic page, passes them and turns the read off. A failed or gated read returns null.
 */
export function useFindingTopic({
	topicId,
	knownFields,
}: {
	topicId: string
	knownFields: Partial<FindingTopicFields>
}): { findingTopic: FindingTopicFields | null; isLoading: boolean } {
	// a caller that names the owner or the team link already holds the topic's fields
	const isKnown = knownFields.owner !== undefined || knownFields.teamLink !== undefined
	const { data, isLoading } = useQuery({
		queryKey: ["finding-topic", topicId],
		queryFn: async () => {
			const topicPage = await fetchTopicPage(topicId)
			return topicPage.status === "visible" ? topicPage.topic : null
		},
		enabled: !isKnown,
		staleTime: FINDING_TOPIC_STALE_MS,
		retry: false,
	})

	// the caller's fields when it has them, and the read's otherwise
	if (isKnown) {
		return {
			findingTopic: {
				owner: knownFields.owner ?? null,
				teamLink: knownFields.teamLink ?? null,
				image: knownFields.image ?? null,
			},
			isLoading: false,
		}
	}
	const findingTopic = data ? { owner: data.owner, teamLink: data.teamLink, image: data.image } : null
	return { findingTopic, isLoading }
}
