// a podcast episode's uploaded image removed, with the connection pool stubbed: its hash is cleared, its files are
// recorded as pending deletions, a public topic's files leave the edge, and an image that is not an upload stays
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as edgePurge from "@carlnotes/server/edgePurge"
import { removePodcastEpisodeImageUpload } from "./podcastEpisodeImageRenders"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stub the pool so the podcast episode read returns one row, in the order it selects: the image's hash, its origin,
// the topic's id, and the topic's visibility. every write returns no row
function stubPodcastEpisodeImage(podcastEpisodeImageRow: unknown[]): SentQuery[] {
	return stubConnectionPool(({ text }) => (text.startsWith("select") ? [podcastEpisodeImageRow] : []))
}

// the podcast episode row's write, and the insert of the pending deletions
function toImageRemovalWrites(sentQueries: SentQuery[]): {
	podcastEpisodeRowUpdate: SentQuery | undefined
	pendingObjectDeletionInsert: SentQuery | undefined
} {
	return {
		podcastEpisodeRowUpdate: sentQueries.find(({ text }) => text.startsWith('update "episodes"')),
		pendingObjectDeletionInsert: sentQueries.find(({ text }) =>
			text.startsWith('insert into "pending_object_deletions"'),
		),
	}
}

test("removing a podcast episode's uploaded image clears its hash, records its files as pending deletions, and returns its topic's id", async () => {
	// the podcast episode of a public topic shows an upload
	const purgeEdgeCacheTagSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue(undefined)
	const sentQueries = stubPodcastEpisodeImage(["hash-upload", "uploaded", "topic-1", "public"])
	expect(await removePodcastEpisodeImageUpload("episode-1")).toBe("topic-1")

	// the podcast episode's row loses the image's hash, its origin, and its prompt
	const { podcastEpisodeRowUpdate, pendingObjectDeletionInsert } = toImageRemovalWrites(sentQueries)
	expect(podcastEpisodeRowUpdate?.text).toContain('set "image_hash" = $1, "image_origin" = $2, "image_prompt" = $3')
	expect(podcastEpisodeRowUpdate?.values.slice(0, 3)).toEqual([null, null, null])
	expect(podcastEpisodeRowUpdate?.values.at(-1)).toBe("episode-1")

	// the original and its six derived files are recorded as pending deletions
	expect(pendingObjectDeletionInsert?.values).toEqual([
		"podcast-episode-images/episode-1/hash-upload/original.jpg",
		"podcast-episode-images/episode-1/hash-upload/page.webp",
		"podcast-episode-images/episode-1/hash-upload/page@2x.webp",
		"podcast-episode-images/episode-1/hash-upload/list.webp",
		"podcast-episode-images/episode-1/hash-upload/list@2x.webp",
		"podcast-episode-images/episode-1/hash-upload/thumbnail.webp",
		"podcast-episode-images/episode-1/hash-upload/thumbnail@2x.webp",
	])

	// the public topic's image files leave the edge
	expect(purgeEdgeCacheTagSpy.mock.calls).toEqual([["topic-image:topic-1"]])
})

test("a podcast episode whose image is generated, or that has no image, keeps its row and its files", async () => {
	// a podcast episode of a public topic with a generated image, then one with no image
	const purgeEdgeCacheTagSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue(undefined)
	for (const podcastEpisodeImageRow of [
		["hash-generated", "generated", "topic-1", "public"],
		[null, null, "topic-1", "public"],
	]) {
		// the removal reads the podcast episode and returns null
		const sentQueries = stubPodcastEpisodeImage(podcastEpisodeImageRow)
		expect(await removePodcastEpisodeImageUpload("episode-1")).toBeNull()

		// nothing is written, and nothing leaves the edge
		expect(toImageRemovalWrites(sentQueries)).toEqual({
			podcastEpisodeRowUpdate: undefined,
			pendingObjectDeletionInsert: undefined,
		})
		expect(sentQueries).toHaveLength(1)
		expect(purgeEdgeCacheTagSpy).not.toHaveBeenCalled()
		restoreConnectionPool()
	}
})
