// removed image upload tests: the sweep's removal takes down each kind's upload and draws nothing, it marks each
// ready film drawn from the upload rendering before the upload goes and starts those films' rebuilds, and an admin's
// removal still draws the image again on the platform's budget
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as podcastEpisodeImageRenders from "../podcast/podcastEpisodeImageRenders"
import * as temporalClient from "../temporalClient"
import * as topicPodcastEpisodeVideoImage from "../topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import * as topicPostImageRenders from "../topicPosts/topicPostImageRenders"
import { regenerateRemovedTopicImage, removeImageUpload } from "./removedImageUploads"
import * as topicImageRenders from "./topicImageRenders"

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// no platform-paid render follows the sweep's check of an upload
test("a removal with no render removes each kind's upload by its subject's id and starts no render", async () => {
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const removeUploadSpies = {
		topicImage: spyOn(topicImageRenders, "removeTopicImageUpload").mockResolvedValue(true),
		podcastEpisodeImage: spyOn(podcastEpisodeImageRenders, "removePodcastEpisodeImageUpload").mockResolvedValue(
			"topic-1",
		),
		topicPostImage: spyOn(topicPostImageRenders, "removeTopicPostImageUpload").mockResolvedValue(true),
		topicPodcastEpisodeVideoImage: spyOn(
			topicPodcastEpisodeVideoImage,
			"removeTopicPodcastEpisodeVideoImageUpload",
		).mockResolvedValue("film-1"),
	}

	// each kind's removal runs once, for its own subject
	stubConnectionPool()
	for (const subjectKind of Object.keys(removeUploadSpies) as (keyof typeof removeUploadSpies)[]) {
		await removeImageUpload({ subjectKind, subjectId: `${subjectKind}-subject` }, "upload-hash")
		expect(removeUploadSpies[subjectKind]).toHaveBeenCalledTimes(1)
		expect(removeUploadSpies[subjectKind]).toHaveBeenCalledWith(`${subjectKind}-subject`)
	}
	expect(startRenderSpy).not.toHaveBeenCalled()
})

// a film whose intro and sign-off show a flagged upload plays again only once it is rebuilt
test("a removal marks each ready film drawn from the upload rendering before the upload goes, then rebuilds it", async () => {
	// the Topic has two ready films drawn from the upload
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('update "topic_podcast_episode_videos"') ? [["episode-1"], ["episode-2"]] : [],
	)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)

	// the removal of the upload keeps how many statements were sent before it ran
	let sentQueryCountAtRemoval = -1
	spyOn(topicImageRenders, "removeTopicImageUpload").mockImplementation(async () => {
		sentQueryCountAtRemoval = sentQueries.length
		return true
	})
	await removeImageUpload({ subjectKind: "topicImage", subjectId: "topic-1" }, "upload-hash")

	// the films of the Topic's podcast episodes that are ready and drawn from the upload are marked rendering first.
	// the second value of the update is the time the row changed
	const [filmUpdate] = sentQueries
	expect(sentQueryCountAtRemoval).toBe(1)
	expect(filmUpdate?.text).toContain('"episodes"."topic_id" = $')
	expect(filmUpdate?.text).toContain('"rendered_image_hash" = $')
	expect(filmUpdate?.values.toSpliced(1, 1)).toEqual(["rendering", "topic-1", "ready", "upload-hash"])
	expect(rebuildSpy.mock.calls).toEqual([["episode-1"], ["episode-2"]])

	// a Topic Post's upload is drawn into no film
	spyOn(topicPostImageRenders, "removeTopicPostImageUpload").mockResolvedValue(true)
	await removeImageUpload({ subjectKind: "topicPostImage", subjectId: "post-1" }, "upload-hash")
	expect(sentQueries).toHaveLength(1)
})

// an admin's Regenerate keeps its render
test("an admin's removal of a topic's upload still draws the image again, billed to no user", async () => {
	stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [["topic-1"]] : []))
	const removeUploadSpy = spyOn(topicImageRenders, "removeTopicImageUpload").mockResolvedValue(true)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	await regenerateRemovedTopicImage("topic-1")
	expect(removeUploadSpy).toHaveBeenCalledWith("topic-1")
	expect(startRenderSpy.mock.calls[0]?.[0]).toMatchObject({ topicId: "topic-1", userId: null, kind: "admin" })
})
