// the Topic Post routes: who starts, saves, publishes, reads, and deletes a post, what each rejection keeps, and who
// reads an unchecked upload over a post's image
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostImageUrls, toUncheckedTopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as topicImages from "@carlnotes/db/topicImages"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import { MODERATION_TEXT_MAX_CHARS } from "@carlnotes/models/moderation"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as edgePurge from "@carlnotes/server/edgePurge"
import * as moderation from "../moderation"
import { toJsonRequest } from "../testSession"
import * as topicPosts from "./topicPosts"
import { topicPostsRoute } from "./topicPostsRoute"
import {
	DRAFT_ROW,
	stubTopicPostRoutes,
	toImageDraftRow,
	toPublishedRow,
	toSave,
	toUserApp,
} from "./topicPostsRouteTestFixtures"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("a draft's save writes the cleaned body with its word count, and a stale version is a conflict", async () => {
	const { saveSpy } = stubTopicPostRoutes(DRAFT_ROW)

	// a body with a script tag is cleaned before the write
	const savedResponse = await toUserApp("member-1").request(
		"/topic-posts/post-1",
		toJsonRequest({ title: "Dialing in", html: "<p>one two</p><script>x()</script>", version: 3 }, "PUT"),
	)
	expect(savedResponse.status).toBe(200)
	expect(await savedResponse.json()).toEqual({ version: 4 })
	expect(saveSpy.mock.calls[0]?.[0]).toMatchObject({ html: "<p>one two</p>", wordCount: 2, version: 3 })

	// a newer save holds the post, so the editor learns the stored version
	saveSpy.mockResolvedValue({ status: "conflict", version: 7 })
	const conflictResponse = await toUserApp("member-1").request("/topic-posts/post-1", toSave(320))
	expect(conflictResponse.status).toBe(409)
	expect(await conflictResponse.json()).toEqual({ error: "conflict", version: 7 })
})

test("a save that drops an image of a public post purges the post's images from the edge", async () => {
	// a published post on a public Topic, and a save that dropped one image
	const topicPostId = crypto.randomUUID()
	const publishedRow = toPublishedRow(10)
	const { saveSpy } = stubTopicPostRoutes({
		...publishedRow,
		topicPost: { ...publishedRow.topicPost, id: topicPostId },
	})
	saveSpy.mockResolvedValue({ status: "saved", version: 4, droppedImageIds: [crypto.randomUUID()] })
	const purgeSpy = spyOn(edgePurge, "purgeEdgeCacheTagAfterDeletion").mockResolvedValue()

	// the save sends the post as it was read, so its images settle on the save's own transaction
	const response = await toUserApp("member-1").request(`/topic-posts/${topicPostId}`, toSave(320))
	expect(response.status).toBe(200)
	expect(saveSpy.mock.calls[0]?.[0]).toMatchObject({
		topicPost: { id: topicPostId, html: publishedRow.topicPost.html },
	})
	expect(purgeSpy).toHaveBeenCalledWith("topic-image:topic-1")
})

test("a save from an editor opened before an admin removed an image leaves the image out", async () => {
	// a draft whose saved body still names a kept image and the removed one
	const topicPostId = crypto.randomUUID()
	const [keptImageId = "", removedImageId = ""] = [crypto.randomUUID(), crypto.randomUUID()]
	const { saveSpy } = stubTopicPostRoutes(toImageDraftRow(topicPostId, []))
	spyOn(topicImages, "loadRemovedTopicPostBodyImageIds").mockResolvedValue([removedImageId])
	const html = toImageDraftRow(topicPostId, [keptImageId, removedImageId]).topicPost.html
	const response = await toUserApp("member-1").request(
		`/topic-posts/${topicPostId}`,
		toJsonRequest({ title: "Dialing in", html, version: 3 }, "PUT"),
	)

	// the saved body keeps the other image alone
	expect(response.status).toBe(200)
	const savedHtml: string = saveSpy.mock.calls[0]?.[0].html ?? ""
	expect(savedHtml).toContain(keptImageId)
	expect(savedHtml).not.toContain(removedImageId)
})

test("a save that shows more images than the author's plan allows is rejected and writes nothing", async () => {
	// six images on the free plan's five
	const topicPostId = crypto.randomUUID()
	const { saveSpy } = stubTopicPostRoutes(toImageDraftRow(topicPostId, []))
	const imageIds = Array.from({ length: 6 }, () => crypto.randomUUID())
	const response = await toUserApp("member-1").request(
		`/topic-posts/${topicPostId}`,
		toJsonRequest(
			{ title: "Dialing in", html: toImageDraftRow(topicPostId, imageIds).topicPost.html, version: 3 },
			"PUT",
		),
	)
	expect(response.status).toBe(422)
	expect(await response.json()).toEqual({ error: "image-limit-reached" })
	expect(saveSpy).not.toHaveBeenCalled()
})

test("a title with a control character is a bad request, and a NUL in the body is dropped before the write", async () => {
	// a NUL in the title is rejected before anything is read or written
	const { saveSpy } = stubTopicPostRoutes(DRAFT_ROW)
	const titleResponse = await toUserApp("member-1").request(
		"/topic-posts/post-1",
		toJsonRequest({ title: "Dialing\u0000 in", html: "<p>one two</p>", version: 3 }, "PUT"),
	)
	expect(titleResponse.status).toBe(400)
	expect(saveSpy).not.toHaveBeenCalled()

	// a NUL in the body never reaches the stored html
	const bodyResponse = await toUserApp("member-1").request(
		"/topic-posts/post-1",
		toJsonRequest({ title: "Dialing in", html: "<p>one\u0000 two</p>", version: 3 }, "PUT"),
	)
	expect(bodyResponse.status).toBe(200)
	expect(saveSpy.mock.calls[0]?.[0]).toMatchObject({ html: "<p>one two</p>", wordCount: 2 })
})

test("a save by anyone but the author is not found, and so is the author's once they may not edit the Topic", async () => {
	const { saveSpy } = stubTopicPostRoutes(DRAFT_ROW)
	expect((await toUserApp("owner-1").request("/topic-posts/post-1", toSave(320))).status).toBe(404)

	// a follower who wrote nothing on a Topic they may not edit
	stubTopicPostRoutes({ ...DRAFT_ROW, topicPost: { ...DRAFT_ROW.topicPost, authorUserId: "follower-1" } })
	expect((await toUserApp("follower-1").request("/topic-posts/post-1", toSave(320))).status).toBe(404)
	expect(saveSpy).not.toHaveBeenCalled()
})

test("a draft of 299 words does not publish and stays a draft", async () => {
	const { publishSpy } = stubTopicPostRoutes({ ...DRAFT_ROW, topicPost: { ...DRAFT_ROW.topicPost, wordCount: 299 } })
	const response = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(response.status).toBe(400)
	expect(await response.json()).toEqual({ error: "incomplete" })
	expect(publishSpy).not.toHaveBeenCalled()
})

test("a flagged text does not publish, and a clean one publishes at once and reports its ids", async () => {
	const { publishSpy, clearHomeSpy, purgeProfileSpy, trackEventSpy } = stubTopicPostRoutes(DRAFT_ROW)
	const classifySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue("harassment")
	const flaggedResponse = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(flaggedResponse.status).toBe(422)
	expect(publishSpy).not.toHaveBeenCalled()

	// the title and the body's text are classified together, and a clean post is published
	classifySpy.mockResolvedValue(null)
	const publishedResponse = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(publishedResponse.status).toBe(200)
	expect(classifySpy.mock.calls.at(-1)?.[0].text).toStartWith("Dialing in\n\nword word")
	expect(publishSpy).toHaveBeenCalledWith("post-1", DRAFT_ROW.topicPost.version)
	expect(trackEventSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual(["social_topic_post_publish", "member-1"])
	expect(trackEventSpy.mock.calls.at(-1)?.[2]).toMatchObject({
		objectId: "post-1",
		topicId: "topic-1",
		isOwner: false,
	})

	// the publish starts what follows it: the summary
	expect(temporalClient.startTopicPostPublishWorkflow).toHaveBeenCalledWith("post-1")

	// a public topic's publish clears the home's cards and purges the author's profile page
	expect(clearHomeSpy).toHaveBeenCalledTimes(1)
	expect(purgeProfileSpy.mock.calls).toEqual([["member-1"]])
})

test("a post longer than one classification is classified in pieces, up to the first flagged piece", async () => {
	// a body of two and a half pieces, with the second piece flagged
	const longHtml = `<p>${"word ".repeat(4000)}</p>`
	const { publishSpy } = stubTopicPostRoutes({ ...DRAFT_ROW, topicPost: { ...DRAFT_ROW.topicPost, html: longHtml } })
	const classifySpy = spyOn(moderation, "toObjectionableCategory")
		.mockResolvedValueOnce(null)
		.mockResolvedValueOnce("harassment")
	const flaggedResponse = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })

	// the third piece is never classified, and the draft stays a draft
	expect(flaggedResponse.status).toBe(422)
	expect(classifySpy).toHaveBeenCalledTimes(2)
	expect(publishSpy).not.toHaveBeenCalled()

	// a clean post has every piece classified, each within the classification's limit
	classifySpy.mockReset().mockResolvedValue(null)
	const publishedResponse = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(publishedResponse.status).toBe(200)
	expect(classifySpy).toHaveBeenCalledTimes(3)
	expect(classifySpy.mock.calls.every(([{ text }]) => text.length <= MODERATION_TEXT_MAX_CHARS)).toBe(true)
})

test("a draft saved again while its text was classified is a conflict and stays a draft", async () => {
	const { publishSpy, trackEventSpy } = stubTopicPostRoutes(DRAFT_ROW)
	publishSpy.mockResolvedValue(false)
	const response = await toUserApp("member-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(response.status).toBe(409)
	expect(await response.json()).toEqual({ error: "conflict", version: DRAFT_ROW.topicPost.version })
	expect(trackEventSpy).not.toHaveBeenCalled()
})

test("a publish on a topic that is not public leaves the home's cards and the author's profile page cached", async () => {
	// the owner's draft on their own private topic
	const { publishSpy, clearHomeSpy, purgeProfileSpy } = stubTopicPostRoutes({
		...DRAFT_ROW,
		topicPost: { ...DRAFT_ROW.topicPost, authorUserId: "owner-1" },
		topic: { ...DRAFT_ROW.topic, visibility: "private" },
	})
	const publishedResponse = await toUserApp("owner-1").request("/topic-posts/post-1/publish", { method: "POST" })
	expect(publishedResponse.status).toBe(200)
	expect(publishSpy).toHaveBeenCalledWith("post-1", DRAFT_ROW.topicPost.version)

	// nothing a visitor reads changed
	expect(clearHomeSpy).not.toHaveBeenCalled()
	expect(purgeProfileSpy).not.toHaveBeenCalled()
})

test("a draft reads for its author alone, and a published post for whoever may open its Topic", async () => {
	stubTopicPostRoutes(DRAFT_ROW)
	expect((await toUserApp("member-1").request("/topic-posts/post-1")).status).toBe(200)
	expect((await toUserApp("owner-1").request("/topic-posts/post-1")).status).toBe(404)
	expect((await toUserApp("admin-1").request("/topic-posts/post-1")).status).toBe(404)

	// a visitor reads a public Topic's published post
	stubTopicPostRoutes(toPublishedRow(60))
	expect((await topicPostsRoute.request("/topic-posts/post-1")).status).toBe(200)

	// a private Topic's post reads as missing to someone who may not open the Topic
	const publishedRow = toPublishedRow(60)
	stubTopicPostRoutes({ ...publishedRow, topic: { ...publishedRow.topic, visibility: "private", teamId: null } })
	const privateResponse = await topicPostsRoute.request("/topic-posts/post-1")
	expect(privateResponse.status).toBe(404)

	// the response holds the error alone, so none of the post's words or its discussion's transcript
	expect(await privateResponse.json()).toEqual({ error: "not found" })
})

test("the author, the Topic's owner, and an admin delete a published post, and another member does not", async () => {
	const { deleteSpy, clearHomeSpy, purgeProfileSpy, trackEventSpy } = stubTopicPostRoutes(toPublishedRow(60))
	const toDelete = (userId: string): Response | Promise<Response> =>
		toUserApp(userId).request("/topic-posts/post-1", { method: "DELETE" })

	// another member of the team is neither the author nor the owner
	expect((await toDelete("member-2")).status).toBe(404)
	expect(deleteSpy).not.toHaveBeenCalled()

	// each of the three roles deletes it, and each delete is reported by its ids
	for (const userId of ["member-1", "owner-1", "admin-1"]) {
		expect((await toDelete(userId)).status).toBe(200)
	}
	expect(deleteSpy).toHaveBeenCalledTimes(3)

	// each delete clears the home's cards and purges the author's profile page
	expect(clearHomeSpy).toHaveBeenCalledTimes(3)
	expect(purgeProfileSpy.mock.calls).toEqual([["member-1"], ["member-1"], ["member-1"]])

	// one delete event for each
	expect((trackEventSpy.mock.calls as unknown[][]).map((call) => call[0])).toEqual([
		"social_topic_post_delete",
		"social_topic_post_delete",
		"social_topic_post_delete",
	])
})

test("a missing post and a visitor's write are not found", async () => {
	stubTopicPostRoutes(null)
	expect((await toUserApp("member-1").request("/topic-posts/post-9")).status).toBe(404)
	stubTopicPostRoutes(DRAFT_ROW)
	expect((await topicPostsRoute.request("/topic-posts/post-1", toSave(320))).status).toBe(404)
	expect((await topicPostsRoute.request("/topic-posts/post-1/publish", { method: "POST" })).status).toBe(404)
	expect((await topicPostsRoute.request("/topic-posts/post-1", { method: "DELETE" })).status).toBe(404)
})

test("an unchecked Topic Post image shows on the post's page to its uploader alone", async () => {
	// a published post whose image member-1 and owner-1 may change, and member-1's unchecked upload
	stubTopicPostRoutes(toPublishedRow(60))
	const publishedImage = toTopicPostImageUrls("post-1", "published-hash")
	spyOn(topicPosts, "toTopicPostResponse").mockImplementation(
		async (userId) =>
			({
				id: "post-1",
				image: publishedImage,
				imageOrigin: "generated",
				canEditImage: userId === "member-1" || userId === "owner-1",
			}) as TopicPostResponse,
	)
	const loadUncheckedImageSpy = spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "member-1" ? ({ imageHash: "unchecked-hash" } as uncheckedImagesDb.UncheckedImageRow) : null,
	)

	// the uploader reads the unchecked upload with its flag, in a response that names no shared cache
	const uploaderResponse = await toUserApp("member-1").request("/topic-posts/post-1")
	expect(await uploaderResponse.json()).toMatchObject({
		image: toUncheckedTopicImageUrls(toTopicPostImageUrls("post-1", "unchecked-hash")),
		imageOrigin: "uploaded",
		isImageUnchecked: true,
	})
	expect(uploaderResponse.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()

	// a second editor, a member who may not change the image, and a visitor each read the published image with no flag
	const otherResponses = [
		await toUserApp("owner-1").request("/topic-posts/post-1"),
		await toUserApp("member-2").request("/topic-posts/post-1"),
		await topicPostsRoute.request("/topic-posts/post-1"),
	]
	for (const otherResponse of otherResponses) {
		const topicPost = (await otherResponse.json()) as TopicPostResponse
		expect(topicPost.image).toEqual(publishedImage)
		expect(topicPost.isImageUnchecked).toBeUndefined()
	}

	// only the two users who may change the image looked for an unchecked image
	expect(loadUncheckedImageSpy.mock.calls.map(([, userId]) => userId)).toEqual(["member-1", "owner-1"])
})
