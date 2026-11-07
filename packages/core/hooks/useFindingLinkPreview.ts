import { fetchTopicFindingLinkPreview } from "@carlnotes/client/topicFindingClient"
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import { useQuery } from "@tanstack/react-query"

// how long a reopened Finding reuses its link preview without another read
const FINDING_LINK_PREVIEW_STALE_MS = 60_000

/**
 * Returns a Finding's link preview, or null if the page offers none or the read fails, and whether the first read is
 * still in progress. A caller with its own preview turns the read off.
 */
export function useFindingLinkPreview(
	findingId: string,
	isEnabled = true,
): { linkPreview: ChatLinkPreview | null; isLoading: boolean } {
	const { data: linkPreview = null, isLoading } = useQuery({
		queryKey: ["finding-link-preview", findingId],
		queryFn: () => fetchTopicFindingLinkPreview(findingId),
		enabled: isEnabled,
		staleTime: FINDING_LINK_PREVIEW_STALE_MS,
		retry: false,
	})
	return { linkPreview, isLoading }
}
