// the count routes. a topic page posts its view, and the topic and podcast episode pages read the counts
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { setCountsCacheHeaders } from "../edgeCache"
import { isSameOriginRequest } from "../sameOrigin"
import {
	countTopicView,
	countWithinRateLimit,
	loadPodcastEpisodeCounts,
	loadTopicCounts,
	toRequestSender,
} from "./viewerCounts"

export const countsRoute = new Hono<AppEnv>()
	// count a topic page's view sent from the app's own origin, within the view rate limit. return 204 in every case so
	// the response never says whether the topic exists
	.post("/topics/:id/view", async (context) => {
		if (isSameOriginRequest(context.req.raw)) {
			const requestSender = toRequestSender(context)
			await countWithinRateLimit({
				requestSender,
				rateLimitName: "topic-view",
				count: () => countTopicView(requestSender, context.req.param("id")),
			})
		}
		return context.body(null, 204)
	})
	// read a topic's viewer and subscriber counts, shared at the edge if the topic is public
	.get("/counts/topics/:id", async (context) => {
		const topicCountsResult = await loadTopicCounts(currentUser(context), context.req.param("id"))
		const response = topicCountsResult
			? context.json(topicCountsResult.counts)
			: context.json({ error: "not found" }, 404)
		setCountsCacheHeaders(context.req.raw, response, topicCountsResult?.isPublic ?? false)
		return response
	})
	// read a podcast episode's listener count, shared at the edge if its topic is public
	.get("/counts/episodes/:id", async (context) => {
		const podcastEpisodeCountsResult = await loadPodcastEpisodeCounts(currentUser(context), context.req.param("id"))
		const response = podcastEpisodeCountsResult
			? context.json(podcastEpisodeCountsResult.counts)
			: context.json({ error: "not found" }, 404)
		setCountsCacheHeaders(context.req.raw, response, podcastEpisodeCountsResult?.isPublic ?? false)
		return response
	})
