// Topic Post image route tests: a public Topic's file at the post's current hash, a draft's and a stale hash's 404,
// an unchecked file to its uploader alone, who may regenerate, the month's limit, a too-large, a wrong-type, and a
// flagged upload, and an upload shown to its uploader alone or published by its Topic's visibility if its check could
// not run
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostImageUrls } from "@carlnotes/contracts/topicImages"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import * as moderationModels from "@carlnotes/models/moderation"
import * as topicImageFiles from "@carlnotes/pipeline/topicImages/topicImageFiles"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as topicPostImageRenders from "@carlnotes/pipeline/topicPosts/topicPostImageRenders"
import * as uncheckedImages from "@carlnotes/pipeline/uncheckedImages"
import * as authorization from "../authorization"
import * as moderation from "../moderation"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { topicPostImagesRoute } from "./topicPostImagesRoute"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"

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

// a member's published post on a public Topic, with an image at one hash
const HASH = "0123456789abcdef0123456789abcdef"
const TOPIC_POST_ROW = {
	topicPost: { id: "post-1", topicId: "topic-1", authorUserId: "member-1", publishedAt: new Date(), imageHash: HASH },
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: "team-1",
		name: "Home espresso",
		imageHash: null,
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
} as TopicPostRow

// the post's read, the stored file, and no row for any other read
function stubTopicPost(topicPostRow: TopicPostRow = TOPIC_POST_ROW): void {
	stubConnectionPool()
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(topicPostRow)
	spyOn(store, "attachmentStream").mockReturnValue(new Blob([new Uint8Array([1, 2, 3])]).stream())
}

// a regenerate as one signed-in user, who counts against a rate limit of their own
function regenerate(userId: string): Promise<Response> {
	return Promise.resolve(
		toSignedInApp(topicPostImagesRoute, userId).request(
			"/topic-posts/post-1/image/regenerate",
			toJsonRequest({ imagePrompt: "at night, in rain" }, "POST"),
		),
	)
}

test("a public Topic's post file is served to a visitor at the current hash, tagged with its Topic", async () => {
	stubTopicPost()
	const response = await topicPostImagesRoute.request(`/topic-post-images/post-1/${HASH}/list@2x.webp`)
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("image/webp")
	expect(response.headers.get("cache-tag")).toBe("topic-image:topic-1")
})

test("a stale hash, a file name that is not a size, and a draft's file are not found", async () => {
	stubTopicPost()
	const staleHash = "ffffffffffffffffffffffffffffffff"
	expect((await topicPostImagesRoute.request(`/topic-post-images/post-1/${staleHash}/page.webp`)).status).toBe(404)
	expect((await topicPostImagesRoute.request(`/topic-post-images/post-1/${HASH}/original.jpg`)).status).toBe(404)

	// a draft has no image to serve
	stubTopicPost({ ...TOPIC_POST_ROW, topicPost: { ...TOPIC_POST_ROW.topicPost, publishedAt: null } })
	expect((await topicPostImagesRoute.request(`/topic-post-images/post-1/${HASH}/page.webp`)).status).toBe(404)
})

test("a team member regenerates another member's post image, and a follower's regenerate reads as missing", async () => {
	stubTopicPost()
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")

	// member-2 is neither the author nor the owner, and the edit gate grants a member of the Topic's team
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const accepted = await regenerate("member-2")
	expect(accepted.status).toBe(202)
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		topicPostId: "post-1",
		userId: "member-2",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
		imagePrompt: "at night, in rain",
	})

	// a follower holds no edit on the Topic, and wrote no part of the post
	isAllowedSpy.mockResolvedValue(false)
	expect((await regenerate("follower-1")).status).toBe(404)
	expect(startRenderSpy).toHaveBeenCalledTimes(1)
})

test("the author regenerates with no edit on the Topic, and a regenerate past the month's limit is refused", async () => {
	stubTopicPost()
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")

	// the author may open the Topic and passes the image gate by authorship, and the month's limit is the Topic
	// image's own
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockImplementation(
		async (_userId, capability) => capability === "topic:view",
	)
	expect((await regenerate("member-1")).status).toBe(429)
	expect(isAllowedSpy).toHaveBeenCalledWith("member-1", "topicImage:regenerate")
	expect(startRenderSpy).not.toHaveBeenCalled()

	// with regenerations left, the render starts
	isAllowedSpy.mockImplementation(async (_userId, capability) => capability !== "topicPost:editImage")
	expect((await regenerate("member-1")).status).toBe(202)
})

test("an author removed from a private team Topic neither regenerates nor uploads their post's image", async () => {
	// the post's Topic is private, and the gate grants its former member nothing
	stubTopicPost({ ...TOPIC_POST_ROW, topic: { ...TOPIC_POST_ROW.topic, visibility: "private" } })
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValue(false)

	// the regenerate reads as missing, before the month's limit is asked
	expect((await regenerate("member-1")).status).toBe(404)
	expect(isAllowedSpy).not.toHaveBeenCalledWith("member-1", "topicImage:regenerate")
	expect(startRenderSpy).not.toHaveBeenCalled()

	// the upload reads as missing too
	const formData = new FormData()
	formData.set("image", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }))
	const upload = await toSignedInApp(topicPostImagesRoute, "member-1").request("/topic-posts/post-1/image", {
		method: "POST",
		body: formData,
	})
	expect(upload.status).toBe(404)
})

test("an upload that is too large or not an image is refused with the Topic image's own errors", async () => {
	stubTopicPost()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const authorApp = toSignedInApp(topicPostImagesRoute, "member-1")

	// a body the limit refuses before it is read
	const tooLarge = await authorApp.request("/topic-posts/post-1/image", {
		method: "POST",
		headers: { "content-length": String(12 * 1024 * 1024) },
		body: "x",
	})
	expect(tooLarge.status).toBe(413)

	// a gif's bytes are not an upload type
	const formData = new FormData()
	formData.set("image", new File([new TextEncoder().encode("GIF89a....")], "a.gif", { type: "image/png" }))
	const wrongType = await authorApp.request("/topic-posts/post-1/image", { method: "POST", body: formData })
	expect(wrongType.status).toBe(400)
	expect(await wrongType.json()).toEqual({ error: "unsupported-type" })
})

test("an upload whose check could not run is saved as unchecked, and the post's image is not replaced", async () => {
	stubTopicPost()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(topicImageFiles, "storeTopicPostImageFiles").mockResolvedValue("unchecked-hash")
	const replaceImageSpy = spyOn(topicPostImageRenders, "replaceTopicPostImage").mockResolvedValue(undefined)
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"unchecked",
	)

	// the upload responds as a success in its released shape, with the unchecked image's urls and marked unchecked
	const authorApp = toSignedInApp(topicPostImagesRoute, "member-1")
	const response = await authorApp.request("/topic-posts/post-1/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		image: toTopicPostImageUrls("post-1", "unchecked-hash"),
		isImageUnchecked: true,
	})

	// the unchecked image's row names the post and its uploader, and nothing is published
	expect(publishOrSaveUncheckedImageSpy.mock.calls[0]?.[0]).toMatchObject({
		subjectKind: "topicPostImage",
		subjectId: "post-1",
		uploaderUserId: "member-1",
		imageHash: "unchecked-hash",
		isUnchecked: true,
	})
	expect(replaceImageSpy).not.toHaveBeenCalled()
})

// the post's read, an editor who may change its image, an upload whose check could not run, and the visibility of the
// post's Topic as the save of the unchecked image reads it. returns each query sent and the publish's spy
function stubUncheckedTopicPostUpload(topicVisibility: "public" | "private"): {
	sentQueries: SentQuery[]
	replaceImageSpy: ReturnType<typeof spyOn>
} {
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(TOPIC_POST_ROW)
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "topic_posts" inner join "topics"') ? [[HASH, "topic-1", topicVisibility]] : [],
	)

	// the edit gate, the check that could not run, and the stored files
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(topicImageFiles, "storeTopicPostImageFiles").mockResolvedValue("new-hash")
	spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	const replaceImageSpy = spyOn(topicPostImageRenders, "replaceTopicPostImage").mockResolvedValue(undefined)
	return { sentQueries, replaceImageSpy }
}

test("an unchecked upload over a public Topic's post is shown to its uploader alone by the visibility its save reads of the post's Topic", async () => {
	const { sentQueries, replaceImageSpy } = stubUncheckedTopicPostUpload("public")
	const editorApp = toSignedInApp(topicPostImagesRoute, "public-post-image-uploader")
	const response = await editorApp.request("/topic-posts/post-1/image", toImageUploadRequest())
	expect(await response.json()).toEqual({ image: toTopicPostImageUrls("post-1", "new-hash"), isImageUnchecked: true })

	// the save of the unchecked image reads the post's current image and its Topic's visibility by the post's id
	const topicVisibilityRead = sentQueries.find(({ text }) => text.includes('from "topic_posts" inner join "topics"'))
	expect(topicVisibilityRead?.text).toContain('select "topic_posts"."image_hash", "topics"."id", "topics"."visibility"')
	expect(topicVisibilityRead?.values).toEqual(["post-1"])

	// the unchecked image's row names the post, its uploader, and the stored files, is not marked published, and nothing
	// is published
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toEqual(
		expect.arrayContaining(["topicPostImage", "post-1", "public-post-image-uploader", "new-hash", false]),
	)
	expect(replaceImageSpy).not.toHaveBeenCalled()
})

test("an unchecked upload over a private Topic's post is the post's image at once, recorded as published", async () => {
	const { sentQueries, replaceImageSpy } = stubUncheckedTopicPostUpload("private")
	const editorApp = toSignedInApp(topicPostImagesRoute, "private-post-image-uploader")
	const response = await editorApp.request("/topic-posts/post-1/image", toImageUploadRequest())
	expect(await response.json()).toEqual({ image: toTopicPostImageUrls("post-1", "new-hash") })

	// the upload is published as an upload that passed is, and the sweep's row is marked published
	expect(replaceImageSpy.mock.calls[0]?.[0]).toMatchObject({
		topicPostId: "post-1",
		hash: "new-hash",
		origin: "uploaded",
	})
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toEqual(expect.arrayContaining(["topicPostImage", "post-1", "new-hash", true]))
})

test("an objectionable upload is rejected with its category, and nothing is stored", async () => {
	stubTopicPost()
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderationModels, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "hate" },
	})
	const storeFilesSpy = spyOn(topicImageFiles, "storeTopicPostImageFiles").mockResolvedValue("flagged-hash")
	const replaceImageSpy = spyOn(topicPostImageRenders, "replaceTopicPostImage").mockResolvedValue(undefined)

	// the upload gets the moderation's 422 with the category, as a Topic image upload does
	const editorApp = toSignedInApp(topicPostImagesRoute, "flagged-post-image-uploader")
	const response = await editorApp.request("/topic-posts/post-1/image", toImageUploadRequest())
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "hate" })
	expect(storeFilesSpy).not.toHaveBeenCalled()
	expect(replaceImageSpy).not.toHaveBeenCalled()
})

test("an unchecked file is served to its uploader alone, with private headers", async () => {
	stubTopicPost()
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "member-1" ? ({ imageHash: "unchecked-hash" } as uncheckedImagesDb.UncheckedImageRow) : null,
	)
	const uncheckedFilePath = "/topic-post-images/post-1/unchecked-hash/page.webp"

	// a visitor reads no unchecked image and gets not found, and so does another signed-in user
	expect((await topicPostImagesRoute.request(uncheckedFilePath)).status).toBe(404)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
	expect((await toSignedInApp(topicPostImagesRoute, "reader-1").request(uncheckedFilePath)).status).toBe(404)

	// the uploader reads the unchecked file in the browser alone, and never from the edge, on a public Topic too
	const uploaderResponse = await toSignedInApp(topicPostImagesRoute, "member-1").request(uncheckedFilePath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()
})
