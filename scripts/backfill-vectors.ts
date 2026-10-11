// one-time backfill: save the vectors of every topic and of every published podcast episode, through the same writes
// that a scan's end and a publish use. a re-run saves the same vectors again.
// run under doppler after the migration: doppler run -- bun scripts/backfill-vectors.ts
import { eq } from "drizzle-orm"
import { db } from "../db"
import { podcastEpisodes } from "../db/schema/podcast"
import { topics } from "../db/schema/topics"
import { savePodcastEpisodeVector, saveTopicVectors } from "../worker/meanVectors"

// the rows to save a vector for, a name for the log, and the write
type SaveVectorsOptions = { ids: string[]; rowName: string; saveVector: (id: string) => Promise<boolean> }

// save each topic's vector, then each published podcast episode's, and return how many rows failed
async function backfill(): Promise<number> {
	// every topic, and every published podcast episode
	const [topicRows, podcastEpisodeRows] = await Promise.all([
		db.select({ id: topics.id }).from(topics),
		db.select({ id: podcastEpisodes.id }).from(podcastEpisodes).where(eq(podcastEpisodes.status, "published")),
	])

	// save the vectors one row at a time
	const topicFailureCount = await saveVectors({
		ids: topicRows.map((topicRow) => topicRow.id),
		rowName: "topics",
		saveVector: saveTopicVectors,
	})
	const podcastEpisodeFailureCount = await saveVectors({
		ids: podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id),
		rowName: "published podcast episodes",
		saveVector: savePodcastEpisodeVector,
	})
	return topicFailureCount + podcastEpisodeFailureCount
}

// save each row's vector and log how many rows have one. a failed row is logged and skipped, and returns how many
// rows failed
async function saveVectors({ ids, rowName, saveVector }: SaveVectorsOptions): Promise<number> {
	let vectorCount = 0
	let failureCount = 0
	for (const id of ids) {
		// count a row whose save wrote a vector, and a row whose save failed
		try {
			vectorCount += (await saveVector(id)) ? 1 : 0
		} catch (error) {
			failureCount++
			console.error(`backfill failed for ${id}`, error)
		}
	}

	// log the counts
	console.log(`saved vectors for ${vectorCount} of ${ids.length} ${rowName}, ${failureCount} failed`)
	return failureCount
}

// exit nonzero if any row failed, so a partial backfill never reads as a finished one
const backfillFailureCount = await backfill()
process.exit(backfillFailureCount > 0 ? 1 : 0)
