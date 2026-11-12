// mean vector tests: each mean averages the current model's embeddings over the rows behind it, a topic vector and an
// episode vector each save whether their topic is public and shown, an empty mean deletes the vector, and marking
// podcast episodes removed deletes their vectors and films and releases the films' profile pins
import { afterEach, expect, test } from "bun:test"
import { type DbTransaction, db } from "@carlnotes/db"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { EMBED_MODEL_NAME } from "@carlnotes/db/schema/scans"
import { deletePodcastEpisodeVectors, savePodcastEpisodeVector, saveTopicVectors } from "./meanVectors"
import { markPodcastEpisodesRemoved } from "./podcast/removePodcastEpisode"

// put the real connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the insert's returned row if the mean found rows, and no rows for every other query
function toUpsertRows(hasMean: boolean): (sentQuery: SentQuery) => unknown[] {
	return (sentQuery) => (hasMean && sentQuery.text.startsWith("insert into") ? [["row-1"]] : [])
}

// the one insert among the sent queries
function findInsert(sentQueries: SentQuery[]): SentQuery {
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert into"))
	if (!insertQuery) {
		throw new Error("no insert was sent")
	}
	return insertQuery
}

// a topic's mean averages its kept findings' current model embeddings and writes over the topic's vector
test("a topic's vector averages its kept findings' current model embeddings", async () => {
	const sentQueries = stubConnectionPool(toUpsertRows(true))
	const isTopicVectorSaved = await saveTopicVectors("topic-1")

	// one upsert of the mean over the topic's findings that no user rated down, from the current model alone
	const insertQuery = findInsert(sentQueries)
	expect(insertQuery.text).toContain('insert into "topic_vectors"')
	expect(insertQuery.text).toContain('avg("resources"."embedding")')
	expect(insertQuery.text).toContain(`"findings"."rating" is distinct from 'down'`)
	expect(insertQuery.text).toContain('"resources"."embedding_model" = $')
	expect(insertQuery.text).toContain('on conflict ("topic_id") do update')
	expect(insertQuery.values).toContain("topic-1")
	expect(insertQuery.values).toContain(EMBED_MODEL_NAME)

	// the mean is saved with whether the topic is public and shown, and the upsert writes the flag again
	const selectText = insertQuery.text.split(" from ")[0] ?? ""
	expect(selectText).toContain('"topics"."visibility" = $')
	expect(insertQuery.text).toContain(
		`where "findings"."topic_id" = "topics"."id" and "findings"."rating" is distinct from 'down') >= $`,
	)
	expect(insertQuery.text).toContain('as "is_public_and_shown"')
	expect(insertQuery.text).toContain('"is_public_and_shown" = excluded.is_public_and_shown')
	expect(insertQuery.values).toContain("public")

	// the upsert wrote a row, so nothing is deleted
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
	expect(isTopicVectorSaved).toBe(true)
})

// the topic's podcast episode vectors follow whether the topic is public and shown
test("a topic's vectors save whether it is public and shown on its podcast episode vectors that differ", async () => {
	const sentQueries = stubConnectionPool(toUpsertRows(true))
	await saveTopicVectors("topic-1")

	// one update of the topic's podcast episode vectors, setting the flag from whether the topic is public and shown
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "episode_vectors"'))
	expect(updateQuery?.text).toContain('set "is_topic_public_and_shown" = exists (select "id" from "topics"')
	expect(updateQuery?.text).toContain('"topics"."visibility" = $')

	// only the topic's rows whose flag differs are written
	expect(updateQuery?.text).toContain('"episode_vectors"."topic_id" = $')
	expect(updateQuery?.text).toContain('"episode_vectors"."is_topic_public_and_shown" <> exists (')
	expect(updateQuery?.values).toContain("topic-1")
})

// a topic with no current model embedding loses its vector
test("a topic with no embedded kept finding has its vector deleted", async () => {
	const sentQueries = stubConnectionPool(toUpsertRows(false))
	const isTopicVectorSaved = await saveTopicVectors("topic-1")

	// the upsert wrote nothing, so the topic's vector is deleted
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("delete"))
	expect(deleteQuery?.text).toContain('delete from "topic_vectors" where "topic_vectors"."topic_id" = $1')
	expect(deleteQuery?.values).toEqual(["topic-1"])
	expect(isTopicVectorSaved).toBe(false)
})

// a podcast episode's mean averages its chapters' current model embeddings, under its topic
test("a podcast episode's vector averages its chapters' current model embeddings", async () => {
	const sentQueries = stubConnectionPool(toUpsertRows(true))
	const isPodcastEpisodeVectorSaved = await savePodcastEpisodeVector("episode-1")

	// one upsert of the chapters' mean under the episode's topic, from the current model alone
	const insertQuery = findInsert(sentQueries)
	expect(insertQuery.text).toContain('insert into "episode_vectors"')
	expect(insertQuery.text).toContain('from "episode_chapters"')
	expect(insertQuery.text).toContain('avg("resources"."embedding")')
	expect(insertQuery.text).toContain('inner join "topics" on "episodes"."topic_id" = "topics"."id"')
	expect(insertQuery.text).toContain('on conflict ("episode_id") do update')
	expect(insertQuery.values).toContain("episode-1")
	expect(insertQuery.values).toContain(EMBED_MODEL_NAME)

	// the upsert saves whether the episode's topic is public and shown
	expect(insertQuery.text).toContain('"topics"."visibility" = $')
	expect(insertQuery.text).toContain('"is_topic_public_and_shown" = excluded.is_topic_public_and_shown')

	// the upsert wrote a row, so nothing is deleted
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
	expect(isPodcastEpisodeVectorSaved).toBe(true)
})

// a podcast episode with no current model embedding loses its vector
test("a podcast episode with no embedded chapter has its vector deleted", async () => {
	const sentQueries = stubConnectionPool(toUpsertRows(false))
	expect(await savePodcastEpisodeVector("episode-1")).toBe(false)

	// the upsert wrote nothing, so the episode's vector is deleted
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("delete"))
	expect(deleteQuery?.text).toContain('delete from "episode_vectors"')
	expect(deleteQuery?.values).toEqual(["episode-1"])
})

// a removal deletes the removed podcast episodes' vectors, reactions, and comments in its transaction
test("marking podcast episodes removed deletes their vectors, reactions, and comments", async () => {
	const sentQueries = stubConnectionPool()
	await markPodcastEpisodesRemoved(db as unknown as DbTransaction, ["episode-1", "episode-2"])

	// one vector delete names both podcast episodes
	const vectorDeleteQueries = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('delete from "episode_vectors"'),
	)
	expect(vectorDeleteQueries).toHaveLength(1)
	expect(vectorDeleteQueries[0]?.values).toEqual(["episode-1", "episode-2"])

	// the removed row is kept, so its reactions and comments are deleted with the vectors
	for (const table of ["reactions", "comments"]) {
		const socialDeleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith(`delete from "${table}"`))
		expect(socialDeleteQuery?.values).toEqual(["episode-1", "episode-2"])
	}
})

// a removal deletes the removed podcast episodes' films and returns their stored keys
test("marking podcast episodes removed deletes their films and returns the films' keys", async () => {
	// one removed podcast episode has a film without a sign-off
	const filmRow = ["intro.mp4", "chapters.mp4", null, "film.mp4", "captions.vtt"]
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('delete from "topic_podcast_episode_videos"') ? [filmRow] : [],
	)
	const { filmKeys } = await markPodcastEpisodesRemoved(db as unknown as DbTransaction, ["episode-1", "episode-2"])

	// the film delete names both podcast episodes, and the keys skip the missing sign-off
	const filmDeleteQuery = sentQueries.find((sentQuery) =>
		sentQuery.text.startsWith('delete from "topic_podcast_episode_videos"'),
	)
	expect(filmDeleteQuery?.values).toEqual(["episode-1", "episode-2"])
	expect(filmKeys).toEqual(["intro.mp4", "chapters.mp4", "film.mp4", "captions.vtt"])
})

// a removal returns the key of every generated image a chapter of a removed film's podcast episode may have
test("marking podcast episodes removed returns the chapter image keys for each chapter of a film", async () => {
	// a film with a joined film alone, whose podcast episode's script has two chapters
	const filmRow = [null, null, null, "film.mp4", null, "episode-1", null]
	const script = { coldOpen: [], segments: [{ transition: [], chapters: [{ turns: [] }, { turns: [] }] }], signOff: [] }

	// answer the script read and the film delete, then mark the podcast episode removed
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "episodes"."id", "episodes"."script"')) {
			return [["episode-1", script]]
		}
		return text.startsWith('delete from "topic_podcast_episode_videos"') ? [filmRow] : []
	})
	const { filmKeys } = await markPodcastEpisodesRemoved(db as unknown as DbTransaction, ["episode-1"])

	// the script is read before the row's update clears it
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const scriptReadIndex = queryTexts.findIndex((text) => text.startsWith('select "episodes"."id", "episodes"."script"'))
	const scriptClearIndex = queryTexts.findIndex((text) => text.startsWith('update "episodes"'))
	expect(scriptReadIndex).toBeGreaterThan(-1)
	expect(scriptReadIndex).toBeLessThan(scriptClearIndex)

	// the film, then in each style each chapter's first image and its eleven numbered images
	const imageNumbers = Array.from({ length: 11 }, (_, i) => i + 1)
	const toChapterImageKeys = (keyPrefix: string): string[] => [
		`${keyPrefix}.jpg`,
		...imageNumbers.map((imageNumber) => `${keyPrefix}-${imageNumber}.jpg`),
	]
	expect(filmKeys).toEqual([
		"film.mp4",
		...toChapterImageKeys("episodes/episode-1/video/chapter-0-image"),
		...toChapterImageKeys("episodes/episode-1/video/chapter-1-image"),
		...toChapterImageKeys("episodes/episode-1/video/chapter-0-image-s2"),
		...toChapterImageKeys("episodes/episode-1/video/chapter-1-image-s2"),
	])
})

// a removal releases a removed podcast episode's film from its topic owner's profile pins before the film is deleted
test("marking podcast episodes removed releases their films' profile pins before deleting the films", async () => {
	// one pinned film of the removed podcast episode, which holds position one. a write returns no row
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('"topic_podcast_episode_videos"."profile_order" is not null')) {
			return text.includes("inner join") ? [["film-1", "owner-1"]] : []
		}
		return text.startsWith('select "profile_order" from "topic_podcast_episode_videos"') ? [[1]] : []
	})
	await markPodcastEpisodesRemoved(db as unknown as DbTransaction, ["episode-1"])

	// the film's profile order clears, and only then is the film deleted
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const clearIndex = queryTexts.findIndex((text) =>
		text.startsWith('update "topic_podcast_episode_videos" set "profile_order" = $1'),
	)
	const deleteIndex = queryTexts.findIndex((text) => text.startsWith('delete from "topic_podcast_episode_videos"'))
	expect(clearIndex).toBeGreaterThan(-1)
	expect(deleteIndex).toBeGreaterThan(clearIndex)
})

// the delete names every podcast episode it was given
test("the vector delete names each podcast episode", async () => {
	const sentQueries = stubConnectionPool()
	await deletePodcastEpisodeVectors(["episode-1"])
	expect(sentQueries[0]?.text).toBe('delete from "episode_vectors" where "episode_vectors"."episode_id" in ($1)')
})
