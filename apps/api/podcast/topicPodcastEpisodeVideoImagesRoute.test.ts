// film image route tests: the editor gate, the month's limit that every image regeneration counts against, a render
// that names the film, an upload cropped to the film's frame, a flagged upload, an upload saved as unchecked with no
// rebuild if its check could not run, the poster at the film's current image alone, an unchecked poster to its uploader
// alone, and a chapter's generated image behind the topic's visibility
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPodcastEpisodeVideoChapterImageUrl } from "@carlnotes/contracts/topicImages"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toSelectionRow,
} from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import * as moderationModels from "@carlnotes/models/moderation"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicPodcastEpisodeVideoImage from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import * as uncheckedImages from "@carlnotes/pipeline/uncheckedImages"
import * as authorization from "../authorization"
import * as moderation from "../moderation"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { namedTopicColumns } from "../topic/permissions"
import { topicPodcastEpisodeVideoImagesRoute } from "./topicPodcastEpisodeVideoImagesRoute"

// a one-pixel png, which an upload crops and resizes to the film's frame
const ONE_PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
)

// the podcast episode's topic as the editor gate and the poster read select it
const TOPIC_ROW = toSelectionRow(namedTopicColumns, {
	id: "topic-1",
	ownerId: "owner-1",
	visibility: "public",
	teamId: null,
	name: "T",
})

// the same topic as a private one, which the view gate guards
const PRIVATE_TOPIC_ROW = toSelectionRow(namedTopicColumns, {
	id: "topic-1",
	ownerId: "owner-1",
	visibility: "private",
	teamId: null,
	name: "T",
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// stub the pool's reads: the topic for the editor gate, the ready film's topic for the chapter image, the film's image
// and the topic for the poster, the film's current image on a public topic for an upload, and the ready film, or no
// film, for the film read. returns each query sent
function stubTopicPodcastEpisodeVideoReads({
	hasTopicPodcastEpisodeVideo = true,
	topicRow = TOPIC_ROW,
}: {
	hasTopicPodcastEpisodeVideo?: boolean
	topicRow?: typeof TOPIC_ROW
} = {}): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		// the editor gate's read of the podcast episode's topic
		if (text.includes('from "episodes" inner join "topics"')) {
			return [topicRow]
		}

		// an upload's read of the film's current image, its topic and that topic's visibility, and the film's id
		if (text.includes('left join "topics"')) {
			return [["hash-current", "topic-1", "public", "film-1"]]
		}

		// the chapter image's read of the ready film's topic, which reads the film's image beside it
		const isTopicRead = text.includes('from "topic_podcast_episode_videos" inner join "episodes"')
		if (isTopicRead && text.includes('"topic_podcast_episode_videos"."status"')) {
			return hasTopicPodcastEpisodeVideo ? [["hash-current", ...topicRow]] : []
		}

		// the poster's read of the film's image with its topic
		if (isTopicRead) {
			return [["hash-current", ...topicRow]]
		}

		// the editor's read of the podcast episode's ready film, and no row for a write
		return hasTopicPodcastEpisodeVideo && text.startsWith("select") ? [["film-1"]] : []
	})
}

// the route with the topic's owner signed in
const ownerApp = toSignedInApp(topicPodcastEpisodeVideoImagesRoute, "owner-1")
const regenerationRequest = toJsonRequest({ imagePrompt: "at dawn, in fog" })

test("a visitor is turned away, and a user who may not edit the topic reads the film as missing", async () => {
	stubTopicPodcastEpisodeVideoReads()
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const visitorResponse = await topicPodcastEpisodeVideoImagesRoute.request(
		"/episodes/episode-1/video/image/regenerate",
		regenerationRequest,
	)
	expect(visitorResponse.status).toBe(401)

	// a signed-in user the edit gate denies
	spyOn(authorization, "isAllowed").mockResolvedValue(false)
	const readerApp = toSignedInApp(topicPodcastEpisodeVideoImagesRoute, "reader-1")
	expect((await readerApp.request("/episodes/episode-1/video/image/regenerate", regenerationRequest)).status).toBe(404)
	expect((await readerApp.request("/episodes/episode-1/video/image", { method: "POST" })).status).toBe(404)
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("an editor of a podcast episode with no ready film has no film image to edit", async () => {
	stubTopicPodcastEpisodeVideoReads({ hasTopicPodcastEpisodeVideo: false })
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	expect((await ownerApp.request("/episodes/episode-1/video/image/regenerate", regenerationRequest)).status).toBe(404)
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("a regenerate past the month's shared limit is rejected, and within it starts a render of the film", async () => {
	stubTopicPodcastEpisodeVideoReads()
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockImplementation(
		async (_userId, capability) => capability !== "topicImage:regenerate",
	)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	expect((await ownerApp.request("/episodes/episode-1/video/image/regenerate", regenerationRequest)).status).toBe(429)
	expect(startRenderSpy).not.toHaveBeenCalled()

	// with regenerations left, the render is a regenerate row that names the film, which the shared limit counts
	isAllowedSpy.mockResolvedValue(true)
	const accepted = await ownerApp.request("/episodes/episode-1/video/image/regenerate", regenerationRequest)
	expect(accepted.status).toBe(202)
	expect(await accepted.json()).toEqual({ renderId: "render-1" })
	expect(isAllowedSpy).toHaveBeenCalledWith("owner-1", "topicImage:regenerate")
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		topicPodcastEpisodeVideoId: "film-1",
		userId: "owner-1",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
		imagePrompt: "at dawn, in fog",
	})
})

// a png the file picker sent as the form's image field
function toImageUploadRequest(): RequestInit {
	const formData = new FormData()
	formData.set("image", new File([ONE_PIXEL_PNG], "a.png", { type: "image/png" }))
	return { method: "POST", body: formData }
}

// spy the store and the publish of a film image, which reach object storage and the film's row
function spyTopicPodcastEpisodeVideoImageWrites(): {
	storeImageSpy: ReturnType<typeof spyOn>
	publishImageSpy: ReturnType<typeof spyOn>
} {
	const storeImageSpy = spyOn(topicPodcastEpisodeVideoImage, "storeTopicPodcastEpisodeVideoImage").mockResolvedValue(
		"hash-new",
	)
	const publishImageSpy = spyOn(
		topicPodcastEpisodeVideoImage,
		"publishTopicPodcastEpisodeVideoImage",
	).mockResolvedValue(undefined)
	return { storeImageSpy, publishImageSpy }
}

test("an upload is cropped to the film's frame, stored as an upload, and returns the poster url", async () => {
	stubTopicPodcastEpisodeVideoReads()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue(null)
	const { storeImageSpy, publishImageSpy } = spyTopicPodcastEpisodeVideoImageWrites()

	// the upload responds with the poster url in its released shape
	const response = await ownerApp.request("/episodes/episode-1/video/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		posterUrl: "/api/topic-podcast-episode-video-images/episode-1/hash-new/poster.jpg",
	})

	// the stored original is the film's frame, and the upload costs nothing and follows no image prompt
	const [, storedOriginal] = storeImageSpy.mock.calls[0] ?? []
	expect([storedOriginal?.width, storedOriginal?.height]).toEqual([1280, 720])
	expect(publishImageSpy).toHaveBeenCalledWith({
		topicPodcastEpisodeVideoId: "film-1",
		podcastEpisodeId: "episode-1",
		imageHash: "hash-new",
		renderId: null,
		origin: "uploaded",
		imagePrompt: null,
		costDollars: 0,
	})
})

test("an upload whose check could not run is saved as unchecked, and its publish with the rebuild never starts", async () => {
	stubTopicPodcastEpisodeVideoReads()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	const { publishImageSpy } = spyTopicPodcastEpisodeVideoImageWrites()
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"unchecked",
	)

	// the upload responds as a success in its released shape, marked unchecked
	const response = await ownerApp.request("/episodes/episode-1/video/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		posterUrl: "/api/topic-podcast-episode-video-images/episode-1/hash-new/poster.jpg",
		isImageUnchecked: true,
	})

	// the unchecked image's row names the film's podcast episode and its uploader, and nothing is published or rebuilt
	expect(publishOrSaveUncheckedImageSpy.mock.calls[0]?.[0]).toMatchObject({
		subjectKind: "topicPodcastEpisodeVideoImage",
		subjectId: "episode-1",
		uploaderUserId: "owner-1",
		imageHash: "hash-new",
		isUnchecked: true,
	})
	expect(publishImageSpy).not.toHaveBeenCalled()
})

test("an unchecked upload on a public topic writes the unchecked image's row alone, and the film is neither written nor rebuilt", async () => {
	// the film's topic is public, which the save of the unchecked image reads through the film's podcast episode
	const sentQueries = stubTopicPodcastEpisodeVideoReads()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(storage, "deleteStoredObjects").mockResolvedValue(undefined)
	const { publishImageSpy } = spyTopicPodcastEpisodeVideoImageWrites()
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)

	// the upload responds as a success in its released shape, marked unchecked
	const uploaderApp = toSignedInApp(topicPodcastEpisodeVideoImagesRoute, "unchecked-film-image-uploader")
	const response = await uploaderApp.request("/episodes/episode-1/video/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ isImageUnchecked: true })

	// the unchecked image's row names the film's podcast episode, its uploader, and the stored file, and is not marked
	// published
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	const uncheckedImageValues = [
		"topicPodcastEpisodeVideoImage",
		"episode-1",
		"unchecked-film-image-uploader",
		"hash-new",
		false,
	]
	expect(uncheckedImageInsert?.values).toEqual(expect.arrayContaining(uncheckedImageValues))

	// the film keeps its image, and no rebuild of its intro and sign-off starts
	expect(publishImageSpy).not.toHaveBeenCalled()
	expect(rebuildSpy).not.toHaveBeenCalled()
})

test("a flagged upload is rejected with its category, and nothing is stored", async () => {
	stubTopicPodcastEpisodeVideoReads()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderationModels, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "sexual" },
	})
	const { storeImageSpy, publishImageSpy } = spyTopicPodcastEpisodeVideoImageWrites()

	// the upload gets the moderation's 422 with the category, and the film's image is unchanged
	const uploaderApp = toSignedInApp(topicPodcastEpisodeVideoImagesRoute, "flagged-film-image-uploader")
	const response = await uploaderApp.request("/episodes/episode-1/video/image", toImageUploadRequest())
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "sexual" })
	expect(storeImageSpy).not.toHaveBeenCalled()
	expect(publishImageSpy).not.toHaveBeenCalled()
})

test("an unchecked poster is served to its uploader alone, with private headers", async () => {
	stubTopicPodcastEpisodeVideoReads()
	spyOn(storage, "attachmentStream").mockReturnValue(new Response("jpeg").body as ReadableStream)
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "owner-1" ? ({ imageHash: "hash-unchecked" } as uncheckedImagesDb.UncheckedImageRow) : null,
	)
	const uncheckedPosterPath = "/topic-podcast-episode-video-images/episode-1/hash-unchecked/poster.jpg"

	// the uploader reads the unchecked file, in the browser alone and never from the edge
	const uploaderResponse = await ownerApp.request(uncheckedPosterPath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
	expect(uploaderResponse.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()

	// another signed-in user and a visitor get not found, and a visitor reads no unchecked image
	const otherUserApp = toSignedInApp(topicPodcastEpisodeVideoImagesRoute, "reader-1")
	expect((await otherUserApp.request(uncheckedPosterPath)).status).toBe(404)
	loadUncheckedImageSpy.mockClear()
	expect((await topicPodcastEpisodeVideoImagesRoute.request(uncheckedPosterPath)).status).toBe(404)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
})

test("the poster serves the film's current image as a jpeg, and no other hash or file", async () => {
	stubTopicPodcastEpisodeVideoReads()
	const streamSpy = spyOn(storage, "attachmentStream").mockReturnValue(new Response("jpeg").body as ReadableStream)
	const posterPath = "/topic-podcast-episode-video-images/episode-1"
	const response = await topicPodcastEpisodeVideoImagesRoute.request(`${posterPath}/hash-current/poster.jpg`)

	// the file streams from the film's folder as a jpeg
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("image/jpeg")
	expect(await response.text()).toBe("jpeg")
	expect(streamSpy).toHaveBeenCalledWith("episodes/episode-1/video/image-hash-current.jpg")

	// a replaced image's hash and any other file name are not found
	expect((await topicPodcastEpisodeVideoImagesRoute.request(`${posterPath}/hash-old/poster.jpg`)).status).toBe(404)
	expect((await topicPodcastEpisodeVideoImagesRoute.request(`${posterPath}/hash-current/original.jpg`)).status).toBe(
		404,
	)
})

test("a chapter's generated image serves as a jpeg, and a chapter or a film with none is not found", async () => {
	stubTopicPodcastEpisodeVideoReads()
	const existsSpy = spyOn(storage, "attachmentExists").mockResolvedValue(true)
	const streamSpy = spyOn(storage, "attachmentStream").mockReturnValue(new Response("jpeg").body as ReadableStream)
	const chapterImagePath = toTopicPodcastEpisodeVideoChapterImageUrl("episode-1", 3).replace("/api", "")
	const response = await topicPodcastEpisodeVideoImagesRoute.request(chapterImagePath)

	// the file streams from the film's folder as a jpeg, cached for an hour at a url that names no version
	expect(response.status).toBe(200)
	expect(response.headers.get("Content-Type")).toBe("image/jpeg")
	expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600")
	expect(response.headers.get("CDN-Cache-Control")).toBeNull()
	expect(await response.text()).toBe("jpeg")
	expect(streamSpy).toHaveBeenCalledWith("episodes/episode-1/video/chapter-3-image-s2.jpg")

	// a film not yet rendered again serves its image in the first style
	existsSpy.mockImplementation(async (objectKey: string) => !objectKey.includes("-s2"))
	expect((await topicPodcastEpisodeVideoImagesRoute.request(chapterImagePath)).status).toBe(200)
	expect(streamSpy).toHaveBeenLastCalledWith("episodes/episode-1/video/chapter-3-image.jpg")

	// a position that is no whole number is not found, without a read of the film
	const chaptersPath = "/topic-podcast-episode-video-images/episode-1/chapters"
	expect((await topicPodcastEpisodeVideoImagesRoute.request(`${chaptersPath}/first/image.jpg`)).status).toBe(404)

	// a chapter with no generated image, and a podcast episode with no ready film
	existsSpy.mockResolvedValue(false)
	expect((await topicPodcastEpisodeVideoImagesRoute.request(chapterImagePath)).status).toBe(404)
	existsSpy.mockResolvedValue(true)
	stubTopicPodcastEpisodeVideoReads({ hasTopicPodcastEpisodeVideo: false })
	expect((await topicPodcastEpisodeVideoImagesRoute.request(chapterImagePath)).status).toBe(404)
})

test("a private topic's chapter image goes to a session the view gate grants, in the browser alone", async () => {
	stubTopicPodcastEpisodeVideoReads({ topicRow: PRIVATE_TOPIC_ROW })
	spyOn(storage, "attachmentExists").mockResolvedValue(true)
	spyOn(storage, "attachmentStream").mockImplementation(() => new Response("jpeg").body as ReadableStream)
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValue(false)
	const chapterImagePath = "/topic-podcast-episode-video-images/episode-1/chapters/0/image.jpg"
	expect((await topicPodcastEpisodeVideoImagesRoute.request(chapterImagePath)).status).toBe(404)

	// the topic's owner passes the view gate, and the file never reaches the edge
	isAllowedSpy.mockResolvedValue(true)
	const response = await ownerApp.request(chapterImagePath)
	expect(response.status).toBe(200)
	expect(response.headers.get("Cache-Control")).toBe("private, max-age=60")
	expect(isAllowedSpy).toHaveBeenLastCalledWith("owner-1", "topic:view", expect.objectContaining({ id: "topic-1" }))
})
