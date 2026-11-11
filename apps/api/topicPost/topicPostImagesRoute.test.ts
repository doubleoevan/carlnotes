// Topic Post image route tests: a public Topic's file at the post's current hash, a draft's and a stale hash's 404,
// who may regenerate, the month's limit, and a too-large and a wrong-type upload
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as topicImageRenders from "@carlnotes/pipeline/topicImages/topicImageRenders"
import * as authorization from "../authorization"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { topicPostImagesRoute } from "./topicPostImagesRoute"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

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
