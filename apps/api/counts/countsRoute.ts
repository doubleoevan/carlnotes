// the count routes. a topic, a profile, a team, and a Topic Post page each post their view, and the topic, podcast
// episode, profile, team, and Topic Post pages read their counts
import type { PodcastEpisodeCounts, TopicCounts, ViewerCounts } from "@carlnotes/contracts/viewerCounts"
import type { RequestSender } from "@carlnotes/server/viewerElements"
import { type Context, Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { setCountsCacheHeaders } from "../edgeCache"
import { isSameOriginRequest } from "../sameOrigin"
import { countTopicPostView, loadTopicPostViewerCounts } from "../topicPost/topicPostViewerCounts"
import {
	type CountsResult,
	countProfileView,
	countTeamView,
	countTopicView,
	countWithinRateLimit,
	loadPodcastEpisodeCounts,
	loadProfileViewerCounts,
	loadTeamViewerCounts,
	loadTopicCounts,
	toRequestSender,
} from "./viewerCounts"

export const countsRoute = new Hono<AppEnv>()
	// count a topic page's view sent from the app's own origin, within the view rate limit. return 204 in every case so
	// the response never says whether the topic exists
	.post("/topics/:id/view", (context) =>
		countSameOriginView(context, {
			rateLimitName: "topic-view",
			count: (requestSender) => countTopicView(requestSender, context.req.param("id")),
		}),
	)
	// count a profile page's view the same way
	.post("/profiles/:userId/view", (context) =>
		countSameOriginView(context, {
			rateLimitName: "profile-view",
			count: (requestSender) => countProfileView(requestSender, context.req.param("userId")),
		}),
	)
	// count a team page's view the same way, so the response never says whether the team exists or opens
	.post("/teams/:id/view", (context) =>
		countSameOriginView(context, {
			rateLimitName: "team-view",
			count: (requestSender) => countTeamView(requestSender, context.req.param("id")),
		}),
	)
	// count a Topic Post page's view the same way, so the response never says whether the Topic Post exists
	.post("/topicPosts/:id/view", (context) =>
		countSameOriginView(context, {
			rateLimitName: "topic-post-view",
			count: (requestSender) => countTopicPostView(requestSender, context.req.param("id")),
		}),
	)
	// read a topic's viewer and subscriber counts, shared at the edge if the topic is public
	.get("/counts/topics/:id", async (context) =>
		toCountsResponse(context, await loadTopicCounts(currentUser(context), context.req.param("id"))),
	)
	// read a podcast episode's listener count, shared at the edge if its topic is public
	.get("/counts/episodes/:id", async (context) =>
		toCountsResponse(context, await loadPodcastEpisodeCounts(currentUser(context), context.req.param("id"))),
	)
	// read a profile's viewer count, shared at the edge
	.get("/counts/profiles/:userId", async (context) =>
		toCountsResponse(context, await loadProfileViewerCounts(context.req.param("userId"))),
	)
	// read a Topic Post's viewer count, shared at the edge if its Topic is public
	.get("/counts/topicPosts/:id", async (context) =>
		toCountsResponse(context, await loadTopicPostViewerCounts(currentUser(context), context.req.param("id"))),
	)
	// read a team's viewer count, shared at the edge if the team is public
	.get("/counts/teams/:id", async (context) =>
		toCountsResponse(context, await loadTeamViewerCounts(currentUser(context), context.req.param("id"))),
	)

// a view's rate limit name, and the count to run for its sender
type CountSameOriginViewOptions = { rateLimitName: string; count: (requestSender: RequestSender) => Promise<void> }

// count a view sent from the app's own origin within its rate limit, and return 204 in every case
async function countSameOriginView(
	context: Context<AppEnv>,
	{ rateLimitName, count }: CountSameOriginViewOptions,
): Promise<Response> {
	if (isSameOriginRequest(context.req.raw)) {
		const requestSender = toRequestSender(context)
		await countWithinRateLimit({ requestSender, rateLimitName, count: () => count(requestSender) })
	}
	return context.body(null, 204)
}

// a page's counts, or a 404 if the page does not open for the caller, shared at the edge if the page is public
function toCountsResponse(
	context: Context<AppEnv>,
	countsResult: CountsResult<TopicCounts | PodcastEpisodeCounts | ViewerCounts> | null,
): Response {
	const response = countsResult ? context.json(countsResult.counts) : context.json({ error: "not found" }, 404)
	setCountsCacheHeaders(context.req.raw, response, countsResult?.isPublic ?? false)
	return response
}
