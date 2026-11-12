// sending a Topic Post page's view once its published Topic Post has loaded
import { useEffect } from "react"
import { sendTopicPostViewOnce } from "../lib/pageViews"

/**
 * Sends the view of a published Topic Post's page once per web tab or mobile app runtime. A draft, or a Topic Post that
 * is still loading, passes null and sends nothing.
 */
export function useTopicPostView(publishedTopicPostId: string | null | undefined): void {
	useEffect(() => {
		if (publishedTopicPostId) {
			sendTopicPostViewOnce(publishedTopicPostId)
		}
	}, [publishedTopicPostId])
}
