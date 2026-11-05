// legacy private explanations cannot enter audio before conversion completes
import { db } from "@carlnotes/db"
import { hasUnconvertedPersonalSources } from "@carlnotes/db/personalSourcesAuthority"
import { PersonalSourcesConversionError } from "@carlnotes/db/personalSourcesLocks"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { eq } from "drizzle-orm"

/**
 * Stops queued audio work only while legacy explanation conversion is pending.
 */
export async function assertPodcastPersonalSourcesConverted(
	options: { topicId: string } | { podcastEpisodeId: string },
): Promise<void> {
	// resolve an episode's current Topic before checking its conversion status
	const [podcastEpisode] =
		"podcastEpisodeId" in options
			? await db
					.select({ topicId: podcastEpisodes.topicId })
					.from(podcastEpisodes)
					.where(eq(podcastEpisodes.id, options.podcastEpisodeId))
			: []
	const currentTopicId = "topicId" in options ? options.topicId : podcastEpisode?.topicId
	if (!currentTopicId || (await hasUnconvertedPersonalSources(currentTopicId))) {
		throw new PersonalSourcesConversionError()
	}
}
