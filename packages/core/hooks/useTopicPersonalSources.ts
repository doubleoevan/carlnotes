import { authClient } from "@carlnotes/client/authClient"
import { fetchTopicPersonalSources } from "@carlnotes/client/personalSourcesClient"
import type { TopicPersonalSources } from "@carlnotes/contracts/personalSources"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { type UseQueryResult, useQuery } from "@tanstack/react-query"
import { canShowTopicPersonalSources } from "../lib/personalSourcesCopy"

/**
 * Shares the sender's live receiving Source count and context state between the page and editor.
 */
export function useTopicPersonalSources(topic?: TopicDetails): UseQueryResult<TopicPersonalSources> {
	const { data: session } = authClient().useSession()
	return useQuery({
		queryKey: ["topic-personalSources", session?.user.id, topic?.id],
		queryFn: ({ signal }) => fetchTopicPersonalSources(topic?.id ?? "", signal),
		enabled: Boolean(session && topic && canShowTopicPersonalSources(topic)),
		gcTime: 0,
		refetchInterval: 15_000,
	})
}
