// topic image route tests: a public file to a visitor with its edge headers, a private file refused with no session, a
// stale hash, the regenerate limit, a too-large and a wrong-type upload, and a removal that starts a render
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toSelectionRow } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as topicImagesDb from "@carlnotes/db/topicImages"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as authorization from "../authorization"
import * as currentUserModule from "../currentUser"
import * as moderation from "../moderation"
import { namedTopicColumns } from "./permissions"
import { topicImagesRoute } from "./topicImagesRoute"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

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

test("removing an upload drops its row and objects and starts a fresh render", async () => {
	stubTopic("public")
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const removeUploadSpy = spyOn(topicImageRenders, "removeTopicImageUpload").mockResolvedValue(true)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-2")
	const response = await topicImagesRoute.request("/topics/topic-1/image", { method: "DELETE" })
	expect(response.status).toBe(202)
	expect(removeUploadSpy).toHaveBeenCalledWith("topic-1")
	expect(startRenderSpy).toHaveBeenCalledWith({
		topicId: "topic-1",
		userId: "owner-1",
		kind: "regenerate",
		model: "gemini-3.1-flash-image",
	})
})
