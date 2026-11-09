// the editor of a podcast episode. a signed-in user who may edit the podcast episode's topic

import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, ne } from "drizzle-orm"
import type { Context } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { namedTopicColumns } from "../topic/permissions"

// the signed-in editor of the route's podcast episode, or the response that turns the request away
type PodcastEpisodeEditor =
	| { userId: string; podcastEpisodeId: string; topicId: string; topicOwnerId: string }
	| { response: Response }

/**
 * Loads the route's podcast episode for a signed-in user the edit gate grants on its topic. A removed podcast episode,
 * and one the user may not edit, reads as missing.
 */
export async function loadPodcastEpisodeEditor(context: Context<AppEnv>): Promise<PodcastEpisodeEditor> {
	// a signed-out visitor is turned away before the podcast episode is read
	const userId = currentUser(context)
	if (!userId) {
		return { response: context.json({ error: "unauthorized" }, 401) }
	}

	// the podcast episode's topic, which the edit gate decides
	const podcastEpisodeId = context.req.param("id") ?? ""
	const [podcastEpisodeTopic] = await db
		.select({ topic: namedTopicColumns })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), ne(podcastEpisodes.status, "removed")))

	// a podcast episode the user may not edit reads as missing
	if (!podcastEpisodeTopic || !(await isAllowed(userId, "topic:edit", podcastEpisodeTopic.topic))) {
		return { response: context.json({ error: "not found" }, 404) }
	}

	// the editor, the podcast episode, and its topic's owner
	const { topic } = podcastEpisodeTopic
	return { userId, podcastEpisodeId, topicId: topic.id, topicOwnerId: topic.ownerId }
}
