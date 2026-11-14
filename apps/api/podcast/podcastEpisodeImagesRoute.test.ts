// podcast episode image route tests: the editor gate for a visitor and for a user who may not edit, the regenerate
// limit, a render that names the podcast episode, a flagged upload, an upload saved as unchecked if its check could not
// run, and an unchecked file to its uploader alone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toPodcastEpisodeImageUrls } from "@carlnotes/contracts/topicImages"
import { restoreConnectionPool, stubConnectionPool, toSelectionRow } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import * as moderationModels from "@carlnotes/models/moderation"
import * as podcastEpisodeImageRenders from "@carlnotes/pipeline/podcast/podcastEpisodeImageRenders"
import * as topicImageFiles from "@carlnotes/pipeline/topicImages/topicImageFiles"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as uncheckedImages from "@carlnotes/pipeline/uncheckedImages"
import * as authorization from "../authorization"
import * as currentUserModule from "../currentUser"
import * as moderation from "../moderation"
import { toSignedInApp } from "../testSession"
import { namedTopicColumns } from "../topic/permissions"
import { podcastEpisodeImagesRoute } from "./podcastEpisodeImagesRoute"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a one-pixel png, which an upload crops and resizes to its frame
const ONE_PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
)

// a png the file picker sent as the form's image field
function toImageUploadRequest(): RequestInit {
	const formData = new FormData()
	formData.set("image", new File([ONE_PIXEL_PNG], "a.png", { type: "image/png" }))
	return { method: "POST", body: formData }
}

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

test("a regenerate past the month's limit is rejected, and within it starts a render of the podcast episode", async () => {
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

test("an upload whose check could not run is saved as unchecked, and the podcast episode's image is not replaced", async () => {
	stubPodcastEpisodeTopic()
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(topicImageFiles, "storePodcastEpisodeImageFiles").mockResolvedValue("unchecked-hash")
	const replaceImageSpy = spyOn(podcastEpisodeImageRenders, "replacePodcastEpisodeImage").mockResolvedValue(undefined)
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"unchecked",
	)

	// the upload responds as a success in its released shape, with the unchecked image's urls and marked unchecked
	const response = await podcastEpisodeImagesRoute.request("/episodes/episode-1/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		image: toPodcastEpisodeImageUrls("episode-1", "unchecked-hash"),
		isImageUnchecked: true,
	})

	// the unchecked image's row names the podcast episode and its uploader, and nothing is published
	expect(publishOrSaveUncheckedImageSpy.mock.calls[0]?.[0]).toMatchObject({
		subjectKind: "podcastEpisodeImage",
		subjectId: "episode-1",
		uploaderUserId: "owner-1",
		imageHash: "unchecked-hash",
		isUnchecked: true,
	})
	expect(replaceImageSpy).not.toHaveBeenCalled()
})

test("a flagged upload is rejected with its category, and nothing is stored", async () => {
	stubPodcastEpisodeTopic()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderationModels, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "violence" },
	})
	const storeFilesSpy = spyOn(topicImageFiles, "storePodcastEpisodeImageFiles").mockResolvedValue("flagged-hash")
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"published",
	)

	// the upload gets the moderation's 422 with the category, and the podcast episode's image is unchanged
	const uploaderApp = toSignedInApp(podcastEpisodeImagesRoute, "flagged-podcast-image-uploader")
	const response = await uploaderApp.request("/episodes/episode-1/image", toImageUploadRequest())
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "violence" })
	expect(storeFilesSpy).not.toHaveBeenCalled()
	expect(publishOrSaveUncheckedImageSpy).not.toHaveBeenCalled()
})

test("an unchecked file is served to its uploader alone, with private headers", async () => {
	// the podcast episode's current image hash, then its topic's gate columns
	const topicRow = toSelectionRow(namedTopicColumns, {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		name: "T",
	})
	stubConnectionPool(() => [["current-hash", ...topicRow]])
	spyOn(store, "attachmentStream").mockReturnValue(new Blob([new Uint8Array([1, 2, 3])]).stream())
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "owner-1" ? ({ imageHash: "unchecked-hash" } as uncheckedImagesDb.UncheckedImageRow) : null,
	)
	const uncheckedFilePath = "/podcast-episode-images/episode-1/unchecked-hash/page.webp"

	// a visitor reads no unchecked image and gets not found, and so does another signed-in user
	expect((await podcastEpisodeImagesRoute.request(uncheckedFilePath)).status).toBe(404)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
	const currentUserSpy = spyOn(currentUserModule, "currentUser").mockReturnValue("reader-1")
	expect((await podcastEpisodeImagesRoute.request(uncheckedFilePath)).status).toBe(404)

	// the uploader reads the unchecked file in the browser alone, and never from the edge
	currentUserSpy.mockReturnValue("owner-1")
	const uploaderResponse = await podcastEpisodeImagesRoute.request(uncheckedFilePath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()
})
