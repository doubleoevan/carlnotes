// podcast episode image tests: only a published podcast episode gets an image drawn, so a workflow that outlives a
// failed or removed row spends nothing on it. a draw that loses to another draw keeps the files the episode shows
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as renderTopicImageOriginal from "../topicImages/renderTopicImageOriginal"
import * as topicImageFiles from "../topicImages/topicImageFiles"
import * as writeTopicImageScene from "../topicImages/writeTopicImageScene"
import { drawPodcastEpisodeImage } from "./podcastEpisodeImage"
import * as podcastEpisodeImageRenders from "./podcastEpisodeImageRenders"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a podcast episode that is not published draws no image", async () => {
	// the scene writer and the render, which a draw would call
	const sceneSpy = spyOn(writeTopicImageScene, "writeTopicImageScene")
	const renderSpy = spyOn(renderTopicImageOriginal, "renderTopicImageOriginal")

	// a failed row, a removed row, and a row still recording, each read in the draw's column order
	for (const status of ["failed", "removed", "recording"]) {
		const sentQueries = stubConnectionPool(() => [["owner-1", status, null]])
		await drawPodcastEpisodeImage({ podcastEpisodeId: "episode-1" })
		expect(sentQueries).toHaveLength(1)
	}
	expect(sceneSpy).not.toHaveBeenCalled()
	expect(renderSpy).not.toHaveBeenCalled()
})

// stub a draw of a published podcast episode with no image whose files land under one hash and whose write changes no
// row, because another draw stored its image first under the hash given. a failing write throws an error, and the row
// then reads the hash given. returns the deleted keys
async function drawAfterAnotherDraw(storedImageHash: string | null, isWriteFailing = false): Promise<string[]> {
	// the scene, the original, and the stored files, so no model or storage call leaves the process
	spyOn(podcastEpisodeImageRenders, "loadPodcastEpisodeImageSceneInput").mockResolvedValue(
		{} as Awaited<ReturnType<typeof podcastEpisodeImageRenders.loadPodcastEpisodeImageSceneInput>>,
	)
	spyOn(writeTopicImageScene, "writeTopicImageScene").mockResolvedValue("a quiet grinder")

	// the original, its kept bytes, and its files under one hash
	spyOn(renderTopicImageOriginal, "renderTopicImageOriginal").mockResolvedValue(
		{} as Awaited<ReturnType<typeof renderTopicImageOriginal.renderTopicImageOriginal>>,
	)
	spyOn(renderTopicImageOriginal, "deleteDrawnImage").mockResolvedValue(undefined)
	spyOn(topicImageFiles, "storePodcastEpisodeImageFiles").mockResolvedValue("hash-1")

	// keep the deleted keys
	const deletedKeys: string[] = []
	spyOn(store, "deleteStoredObjects").mockImplementation(async (objectKeys) => {
		deletedKeys.push(...objectKeys)
	})

	// the published row with no image, the write that changes no row or fails, then the hash that the row's image is under
	stubConnectionPool(({ text }) => {
		if (text.startsWith("update") && isWriteFailing) {
			throw new Error("write failed")
		}
		if (text.startsWith("update")) {
			return []
		}
		// the hash read after the write, or the published row read before the draw
		return text.startsWith('select "image_hash"') ? [[storedImageHash]] : [["owner-1", "published", null]]
	})

	// draw on the platform's key, so no owner's key is read. a failed write's error is expected
	await drawPodcastEpisodeImage({ podcastEpisodeId: "episode-1", isPlatformBilled: true }).catch((error: unknown) => {
		if (!isWriteFailing) {
			throw error
		}
	})
	return deletedKeys
}

// an overlapping draw reads the bytes that the first draw kept, so both store their files under one hash
test("a draw that loses to another draw under the same hash keeps the files the episode shows", async () => {
	expect(await drawAfterAnotherDraw("hash-1")).toEqual([])
})

test("a draw that loses to another draw under another hash deletes its own files", async () => {
	expect(await drawAfterAnotherDraw("hash-2")).toEqual(
		topicImageFiles.toPodcastEpisodeImageObjectKeys("episode-1", "hash-1"),
	)
})

test("a draw whose write fails keeps its files while the podcast episode has no image", async () => {
	expect(await drawAfterAnotherDraw(null, true)).toEqual([])
})
