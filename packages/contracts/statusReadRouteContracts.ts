// the status read routes the app reaches: a film's, a Topic Post Discussion's, and a Topic's latest Scan's, each after
// /api/status/
import type { ApiRouteContract } from "./apiRouteContracts"
import { idParam } from "./routeShapes"
import { topicPostDiscussionStatusRead, topicScanStatusRead, topicVideoStatusRead } from "./statusReads"

// the entries, in client function order
export const statusReadRouteContracts: Record<string, ApiRouteContract> = {
	"statusReadClient.fetchTopicVideoStatus": {
		method: "GET",
		path: "/api/status/episodes/:id/topic-video",
		params: idParam,
		response: topicVideoStatusRead,
	},
	"statusReadClient.fetchTopicPostDiscussionStatus": {
		method: "GET",
		path: "/api/status/topic-posts/:id/discussion",
		params: idParam,
		response: topicPostDiscussionStatusRead,
	},
	"statusReadClient.fetchTopicScanStatus": {
		method: "GET",
		path: "/api/status/topics/:id/scan",
		params: idParam,
		response: topicScanStatusRead,
	},
}
