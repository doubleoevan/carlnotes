// keep topic page views in memory for one web tab or native app runtime
import { sendTopicView } from "@carlnotes/client/viewerCountsClient"

// keep the topics this runtime has sent a view for
const viewedTopicIds = new Set<string>()

/**
 * Sends the Topic page's view once per web tab or native app runtime.
 */
export function sendTopicViewOnce(topicId: string): void {
	if (!viewedTopicIds.has(topicId)) {
		viewedTopicIds.add(topicId)
		sendTopicView(topicId)
	}
}
