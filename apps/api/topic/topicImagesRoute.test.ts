// topic image route tests: a public file to a visitor with its edge headers, a private file refused with no session, a
// stale hash, an unchecked file to its uploader alone, the regenerate limit, a regenerate that keeps a published
// unchecked image, a too-large, a wrong-type, and a flagged upload, an upload saved as unchecked if its check could not
// run, and a private topic's upload that is published all the same
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toSelectionRow,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { uncheckedImages as uncheckedImagesTable } from "@carlnotes/db/schema/uncheckedImages"
import * as store from "@carlnotes/db/store"
import * as topicImagesDb from "@carlnotes/db/topicImages"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import * as moderationModels from "@carlnotes/models/moderation"
import * as topicImageFiles from "@carlnotes/pipeline/topicImages/topicImageFiles"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as uncheckedImages from "@carlnotes/pipeline/uncheckedImages"
import * as authorization from "../authorization"
import * as currentUserModule from "../currentUser"
import * as moderation from "../moderation"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { namedTopicColumns } from "./permissions"
import { topicImagesRoute } from "./topicImagesRoute"

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

// the topic's gate row at a visibility, and its image row
const HASH = "0123456789abcdef0123456789abcdef"
function stubTopic(visibility: "public" | "private"): void {
	stubConnectionPool(({ text }) =>
		text.includes('from "topics"')
			? [toSelectionRow(namedTopicColumns, { id: "topic-1", ownerId: "owner-1", visibility, teamId: null, name: "T" })]
			: [],
	)
	spyOn(topicImagesDb, "loadTopicImage").mockResolvedValue({
		topicId: "topic-1",
		hash: HASH,
		origin: "generated",
		scene: null,
		model: null,
		imagePrompt: null,
		width: 1264,
		height: 848,
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	spyOn(store, "attachmentStream").mockReturnValue(new Blob([new Uint8Array([1, 2, 3])]).stream())
}

test("a public topic's file is served to a visitor with immutable edge headers and the topic's tag", async () => {
	stubTopic("public")
	const response = await topicImagesRoute.request(`/topic-images/topic-1/${HASH}/list@2x.webp`)

	// the file comes with the card routes' headers and the topic's tag
	expect(response.status).toBe(200)
	expect(response.headers.get("content-type")).toBe("image/webp")
	expect(response.headers.get("cache-control")).toContain("immutable")
	expect(response.headers.get("cdn-cache-control")).toBeTruthy()
	expect(response.headers.get("cache-tag")).toBe("topic-image:topic-1")
})

test("a private topic's file is not found without a session, and private in the browser with one", async () => {
	stubTopic("private")
	const refused = await topicImagesRoute.request(`/topic-images/topic-1/${HASH}/page.webp`)
	expect(refused.status).toBe(404)

	// a session the view gate grants gets the file, cached by the browser alone
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const served = await topicImagesRoute.request(`/topic-images/topic-1/${HASH}/page.webp`)
	expect(served.status).toBe(200)
	expect(served.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
	expect(served.headers.get("cache-tag")).toBeNull()
})

test("a stale hash and a file name that is not a size are not found", async () => {
	stubTopic("public")
	expect(
		(await topicImagesRoute.request("/topic-images/topic-1/ffffffffffffffffffffffffffffffff/page.webp")).status,
	).toBe(404)
	expect((await topicImagesRoute.request(`/topic-images/topic-1/${HASH}/original.jpg`)).status).toBe(404)
})

test("a regenerate past the month's limit is refused, and within it starts a render with the image prompt", async () => {
	stubTopic("public")
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockImplementation(
		async (_userId, capability) => capability !== "topicImage:regenerate",
	)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const regenerate = (): Promise<Response> =>
		Promise.resolve(
			topicImagesRoute.request("/topics/topic-1/image/regenerate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ imagePrompt: "at night, in rain" }),
			}),
		)
	expect((await regenerate()).status).toBe(429)
	expect(startRenderSpy).not.toHaveBeenCalled()

	// with regenerations left, the render starts on the better model with the image prompt
	isAllowedSpy.mockResolvedValue(true)
	const accepted = await regenerate()
	expect(accepted.status).toBe(202)
	expect(await accepted.json()).toEqual({ renderId: "render-1" })
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		userId: "owner-1",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
		imagePrompt: "at night, in rain",
	})
})

test("an image prompt the moderation flags is refused before any render starts", async () => {
	stubTopic("public")
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue("sexual")
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const response = await topicImagesRoute.request("/topics/topic-1/image/regenerate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ imagePrompt: "a flagged prompt" }),
	})
	expect(response.status).toBe(422)
	expect(startRenderSpy).not.toHaveBeenCalled()
})

test("an upload that is too large or not an image is refused", async () => {
	stubTopic("public")
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)

	// a body the limit refuses before it is read
	const tooLarge = await topicImagesRoute.request("/topics/topic-1/image", {
		method: "POST",
		headers: { "content-length": String(12 * 1024 * 1024) },
		body: "x",
	})
	expect(tooLarge.status).toBe(413)

	// a gif's bytes are not an upload type
	const formData = new FormData()
	formData.set("image", new File([new TextEncoder().encode("GIF89a....")], "a.gif", { type: "image/png" }))
	const wrongType = await topicImagesRoute.request("/topics/topic-1/image", { method: "POST", body: formData })
	expect(wrongType.status).toBe(400)
	expect(await wrongType.json()).toEqual({ error: "unsupported-type" })
})

test("an unchecked file is served to its uploader alone, with private headers", async () => {
	stubTopic("public")
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "owner-1" ? ({ imageHash: "unchecked-hash" } as uncheckedImagesDb.UncheckedImageRow) : null,
	)
	const uncheckedFilePath = "/topic-images/topic-1/unchecked-hash/page.webp"

	// a visitor reads no unchecked image and gets not found, as for any hash that is not the topic's current one
	expect((await topicImagesRoute.request(uncheckedFilePath)).status).toBe(404)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()

	// another signed-in user gets not found too
	const currentUserSpy = spyOn(currentUserModule, "currentUser").mockReturnValue("reader-1")
	expect((await topicImagesRoute.request(uncheckedFilePath)).status).toBe(404)

	// the uploader reads the unchecked file in the browser alone, and never from the edge, on a public topic too
	currentUserSpy.mockReturnValue("owner-1")
	const uploaderResponse = await topicImagesRoute.request(uncheckedFilePath)
	expect(uploaderResponse.status).toBe(200)
	expect(uploaderResponse.headers.get("cache-control")).toBe("private, max-age=31536000, immutable")
	expect(uploaderResponse.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()
})

test("an upload whose check could not run is saved as unchecked, and the topic's image is not replaced", async () => {
	stubTopic("public")
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(topicImageFiles, "storeTopicImageFiles").mockResolvedValue("unchecked-hash")
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"unchecked",
	)

	// the upload responds as a success in its released shape, with the unchecked image's urls and marked unchecked
	const response = await topicImagesRoute.request("/topics/topic-1/image", toImageUploadRequest())
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		image: toTopicImageUrls("topic-1", "unchecked-hash"),
		isImageUnchecked: true,
	})

	// the unchecked image's row names the topic, its uploader, and the original's pixel size, and nothing is published
	expect(publishOrSaveUncheckedImageSpy.mock.calls[0]?.[0]).toMatchObject({
		subjectKind: "topicImage",
		subjectId: "topic-1",
		uploaderUserId: "owner-1",
		imageHash: "unchecked-hash",
		isUnchecked: true,
	})
	expect(publishOrSaveUncheckedImageSpy.mock.calls[0]?.[0].width).toBeGreaterThan(0)
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
})

test("a private topic's upload whose check could not run is the topic's image at once, not marked unchecked", async () => {
	// the topic's gate row, then the subject's read of its current image and visibility
	stubConnectionPool(({ text }) => {
		if (text.includes('select "image_hash", "id", "visibility" from "topics"')) {
			return [["current-hash", "topic-1", "private"]]
		}
		return text.includes('from "topics"')
			? [toSelectionRow(namedTopicColumns, { id: "topic-1", ownerId: "owner-1", visibility: "private", name: "T" })]
			: []
	})

	// the owner's upload, with a check that could not run and the stored files and the publish spied
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableImageCategory").mockResolvedValue("unchecked")
	spyOn(topicImageFiles, "storeTopicImageFiles").mockResolvedValue("new-hash")
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)

	// the upload is published as an upload that passed is, and its response is not marked unchecked
	const response = await topicImagesRoute.request("/topics/topic-1/image", toImageUploadRequest())
	expect(await response.json()).toEqual({ image: toTopicImageUrls("topic-1", "new-hash") })
	expect(replaceTopicImageSpy.mock.calls[0]?.[0]).toMatchObject({
		topicId: "topic-1",
		hash: "new-hash",
		origin: "uploaded",
	})
})

// the public topic topic-1 as an editor edits it: the gate's row, the topic's current image hash and visibility, and
// a published unchecked image's row for that image, which records that the image was never checked
function stubTopicWithPublishedUncheckedImage(): SentQuery[] {
	const publishedUncheckedImageRow = toTableRow(uncheckedImagesTable, {
		id: "unchecked-published",
		subjectKind: "topicImage",
		subjectId: "topic-1",
		uploaderUserId: "owner-1",
		imageHash: "current-hash",
		isPublished: true,
		uploadedAt: new Date(),
	})
	const topicRow = toSelectionRow(namedTopicColumns, { id: "topic-1", ownerId: "owner-1", visibility: "public" })

	// the unchecked image's row, for a read of the topic's unchecked image
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "unchecked_images"')) {
			return [publishedUncheckedImageRow]
		}

		// the topic's current image, then its gate row
		if (text.includes('select "image_hash", "id", "visibility" from "topics"')) {
			return [["current-hash", "topic-1", "public"]]
		}
		return text.includes('from "topics"') ? [topicRow] : []
	})

	// whoever is signed in may edit
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	return sentQueries
}

test("a flagged upload is rejected with its category, and nothing is stored", async () => {
	stubTopic("public")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(moderationModels, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "sexual" },
	})
	const storeFilesSpy = spyOn(topicImageFiles, "storeTopicImageFiles").mockResolvedValue("flagged-hash")
	const publishOrSaveUncheckedImageSpy = spyOn(uncheckedImages, "publishOrSaveUncheckedImage").mockResolvedValue(
		"published",
	)

	// the upload gets the moderation's 422 with the category, and the topic's image is unchanged
	const uploaderApp = toSignedInApp(topicImagesRoute, "flagged-topic-image-uploader")
	const response = await uploaderApp.request("/topics/topic-1/image", toImageUploadRequest())
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ rejection: "objectionable", category: "sexual" })
	expect(storeFilesSpy).not.toHaveBeenCalled()
	expect(publishOrSaveUncheckedImageSpy).not.toHaveBeenCalled()
})

test("a regenerate leaves a published unchecked image for the sweep", async () => {
	const sentQueries = stubTopicWithPublishedUncheckedImage()
	spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")
	const editorApp = toSignedInApp(topicImagesRoute, "published-unchecked-topic-image-editor")
	const response = await editorApp.request("/topics/topic-1/image/regenerate", toJsonRequest({}))

	// the render starts, and the row that records the unchecked current image is not deleted
	expect(response.status).toBe(202)
	expect(startRenderSpy).toHaveBeenCalledTimes(1)
	expect(sentQueries.some(({ text }) => text.includes('from "unchecked_images"'))).toBe(true)
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "unchecked_images"'))).toBe(false)
})
