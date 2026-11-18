import { db } from "@carlnotes/db"
import { topicVideos } from "@carlnotes/db/schema/podcast"
import { eq } from "drizzle-orm"

// Hold the database lock only while reading or publishing the private objects.
export async function withTopicVideoLock<T>(episode: string, action: () => Promise<T>): Promise<T> {
	return db.transaction(async (transaction) => {
		const [row] = await transaction
			.select({ id: topicVideos.id })
			.from(topicVideos)
			.where(eq(topicVideos.podcastEpisodeId, episode))
			.for("update")
		if (!row) {
			throw Error("The episode no longer owns its film")
		}
		return action()
	})
}
