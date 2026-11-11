import { fetchTopicPage, type TopicPageResult } from "@carlnotes/client/topicClient"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useQuery } from "@tanstack/react-query"

// how long a reopened note reuses its Topic without another read
const TOPIC_NOTE_STALE_MS = 60_000

// the Topic whose note a row opens, who reads it, and whether the note is open
type UseTopicNoteOptions = { topicId: string; userId: string | null; isOpen: boolean }

// the Topic once it loads, and whether the read ended with no Topic the reader may open
type TopicNote = { topic: TopicResponse | null; isUnavailable: boolean }

/**
 * Reads a Topic for its note once the note opens, under the Topic page's own cache key, so the page then opens with
 * no second read. A note opened again within a minute reuses its read. A Topic the reader may not open, a missing one,
 * and a failed read all end as unavailable.
 */
export function useTopicNote({ topicId, userId, isOpen }: UseTopicNoteOptions): TopicNote {
	const topicPageQuery = useQuery<TopicPageResult>({
		queryKey: ["topic-page", userId, topicId],
		queryFn: () => fetchTopicPage(topicId),
		enabled: isOpen,
		staleTime: TOPIC_NOTE_STALE_MS,
		retry: false,
	})
	const topicPage = topicPageQuery.data
	return {
		topic: topicPage?.status === "visible" ? topicPage.topic : null,
		isUnavailable: topicPageQuery.isError || (topicPage !== undefined && topicPage.status !== "visible"),
	}
}
