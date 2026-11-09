// the podcast episode image route: one file of an episode's own image, gated by its topic's visibility

import { fromTopicImageFileName } from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { toPodcastEpisodeImageFileKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { namedTopicColumns } from "../topic/permissions"
import { serveImageFile } from "../topic/serveImageFile"

// the podcast episode image route
export const podcastEpisodeImagesRoute = new Hono<AppEnv>().get(
	"/podcast-episode-images/:podcastEpisodeId/:hash/:file",
	async (context) => {
		// the file the url names
		const { podcastEpisodeId, hash, file } = context.req.param()
		const derivedFile = fromTopicImageFileName(file)

		// the podcast episode at its current hash alone, with its topic
		const [podcastEpisodeTopic] = derivedFile
			? await db
					.select({ imageHash: podcastEpisodes.imageHash, topic: namedTopicColumns })
					.from(podcastEpisodes)
					.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
					.where(eq(podcastEpisodes.id, podcastEpisodeId))
			: []

		// an unknown file, an unknown episode, or a hash that is no longer current is not found
		if (!podcastEpisodeTopic || podcastEpisodeTopic.imageHash !== hash) {
			return context.json({ error: "not found" }, 404)
		}
		return serveImageFile(context, {
			topic: podcastEpisodeTopic.topic,
			objectKey: toPodcastEpisodeImageFileKey(podcastEpisodeId, hash, file),
		})
	},
)
