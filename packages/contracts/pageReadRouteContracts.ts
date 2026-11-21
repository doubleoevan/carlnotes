// the page read routes the app reaches: a profile's, a topic's, a podcast episode's, and a Topic Post's, each with its
// head and its first screen
import type { ApiRouteContract } from "./apiRouteContracts"
import {
	podcastEpisodePageRead,
	profilePageRead,
	profilePageReadQuery,
	topicPageRead,
	topicPostPageRead,
} from "./pageReads"
import { idParam, podcastEpisodePageParam, topicPageReadQuery, userIdParam } from "./routeShapes"

// the entries, in client function order
export const pageReadRouteContracts: Record<string, ApiRouteContract> = {
	"pageReadClient.fetchProfilePageRead": {
		method: "GET",
		path: "/api/profiles/:userId/page",
		params: userIdParam,
		query: profilePageReadQuery,
		response: profilePageRead,
	},
	"pageReadClient.fetchTopicPageRead": {
		method: "GET",
		path: "/api/topics/:id/page",
		params: idParam,
		query: topicPageReadQuery,
		response: topicPageRead,
	},
	"pageReadClient.fetchPodcastEpisodePageRead": {
		method: "GET",
		path: "/api/topics/:id/episodes/:season/:episodeNumber/page",
		params: podcastEpisodePageParam,
		response: podcastEpisodePageRead,
	},
	"pageReadClient.fetchTopicPostPageRead": {
		method: "GET",
		path: "/api/topic-posts/:id/page",
		params: idParam,
		response: topicPostPageRead,
	},
}
