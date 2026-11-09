// podcast episode image route tests: the editor gate for a visitor and for a user who may not edit, the regenerate
// limit, a render that names the podcast episode, and the removal of an upload
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toSelectionRow } from "@carlnotes/db/connectionPoolStub"
import * as podcastEpisodeImageRenders from "@carlnotes/pipeline/podcast/podcastEpisodeImageRenders"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as authorization from "../authorization"
import * as currentUserModule from "../currentUser"
import { namedTopicColumns } from "../topic/permissions"
import { podcastEpisodeImagesRoute } from "./podcastEpisodeImagesRoute"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the podcast episode's topic row, which the editor gate reads. a nested select's columns come flat, in order
function stubPodcastEpisodeTopic(): void {
	stubConnectionPool(() => [
		toSelectionRow(namedTopicColumns, {
			id: "topic-1",
			ownerId: "owner-1",
			visibility: "public",
			teamId: null,
			name: "T",
		}),
	])
}

// a regenerate request with an image prompt
function requestRegeneration(): Promise<Response> {
	return Promise.resolve(
		podcastEpisodeImagesRoute.request("/episodes/episode-1/image/regenerate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ imagePrompt: "at dawn, in fog" }),
		}),
	)
}

test("a visitor is turned away, and a user who may not edit the topic reads the podcast episode as missing", async () => {
	stubPodcastEpisodeTopic()
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	expect((await requestRegeneration()).status).toBe(401)

	// a signed-in user the edit gate denies
	spyOn(currentUserModule, "currentUser").mockReturnValue("reader-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	expect((await requestRegeneration()).status).toBe(404)
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("a regenerate past the month's limit is refused, and within it starts a render of the podcast episode", async () => {
	stubPodcastEpisodeTopic()
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockImplementation(
		async (_userId, capability) => capability !== "topicImage:regenerate",
	)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	expect((await requestRegeneration()).status).toBe(429)
	expect(startRenderSpy).not.toHaveBeenCalled()

	// with regenerations left, the render names the podcast episode beside its topic
	isAllowedSpy.mockResolvedValue(true)
	const accepted = await requestRegeneration()
	expect(accepted.status).toBe(202)
	expect(await accepted.json()).toEqual({ renderId: "render-1" })
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		podcastEpisodeId: "episode-1",
		userId: "owner-1",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
		imagePrompt: "at dawn, in fog",
	})
})

test("removing an image that is not an upload is not found, and removing an upload starts a fresh render", async () => {
	stubPodcastEpisodeTopic()
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const removeUploadSpy = spyOn(podcastEpisodeImageRenders, "removePodcastEpisodeImageUpload").mockResolvedValue(false)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-2")
	const requestRemoval = (): Promise<Response> =>
		Promise.resolve(podcastEpisodeImagesRoute.request("/episodes/episode-1/image", { method: "DELETE" }))
	expect((await requestRemoval()).status).toBe(404)
	expect(startRenderSpy).not.toHaveBeenCalled()

	// an upload goes, and a render takes its place
	removeUploadSpy.mockResolvedValue(true)
	const accepted = await requestRemoval()
	expect(accepted.status).toBe(202)
	expect(removeUploadSpy).toHaveBeenCalledWith("episode-1")
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		podcastEpisodeId: "episode-1",
		userId: "owner-1",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
	})
})
