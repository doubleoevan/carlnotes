// the topic page views this tab has sent, kept in memory only. a reload starts over
import { sendTopicView } from "@carlnotes/client/viewerCountsClient"

// the topics this tab has sent a view for
const viewedTopicIds = new Set<string>()

/**
 * Sends the topic page's view unless this tab already sent one.
 */
export function sendTopicViewOnce(topicId: string): void {
	if (!viewedTopicIds.has(topicId)) {
		viewedTopicIds.add(topicId)
		sendTopicView(topicId)
	}
}
