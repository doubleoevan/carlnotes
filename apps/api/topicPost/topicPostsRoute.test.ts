// the Topic Post routes: who starts, saves, publishes, reads, and deletes a post, and what each rejection keeps
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
// the modules a route test stands in for
import * as socialLimits from "@carlnotes/db/socialLimits"
import { MODERATION_TEXT_MAX_CHARS } from "@carlnotes/models/moderation"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as analytics from "@carlnotes/server/analytics"
import * as edgeCache from "../edgeCache"
import * as moderation from "../moderation"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as homeOrder from "../topic/homeOrder"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"
import { topicPostsRoute } from "./topicPostsRoute"
import * as topicPostWrites from "./topicPostWrites"

// a body of a given count of words, as the editor saves it
const toBodyHtml = (wordCount: number): string => `<p>${Array.from({ length: wordCount }, () => "word").join(" ")}</p>`

// a draft by member-1 on owner-1's public Topic
const DRAFT_ROW: TopicPostRow = {
	topicPost: {
		id: "post-1",
		topicId: "topic-1",
		authorUserId: "member-1",
		title: "Dialing in",
		// a body past the 300 words, at its third version
		html: toBodyHtml(320),
		wordCount: 320,
		version: 3,
		publishedAt: null,
		editedAt: null,
		summary: null,
		cost: "0",
		imageHash: null,
		imageOrigin: null,
		imagePrompt: null,
		imageUpdatedAt: null,
		homeOrder: null,
		profileOrder: null,
		viewerCount: 0,
		createdAt: new Date("2026-11-09T12:00:00Z"),
		updatedAt: new Date("2026-11-09T12:00:00Z"),
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: "team-1",
		name: "Home espresso",
		imageHash: null,
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
}

// the same post published a given count of minutes ago
const toPublishedRow = (minutesAgo: number): TopicPostRow => ({
	...DRAFT_ROW,
	topicPost: { ...DRAFT_ROW.topicPost, publishedAt: new Date(Date.now() - minutesAgo * 60_000) },
})

// stand in for the reads and writes around a route: the post's row, the team's memberships, each user's access row,
// the day's limit, the classification, and the events
function stubTopicPostRoutes(topicPostRow: TopicPostRow | null): {
	saveSpy: ReturnType<typeof spyOn>
	publishSpy: ReturnType<typeof spyOn>
	deleteSpy: ReturnType<typeof spyOn>
	clearHomeSpy: ReturnType<typeof spyOn>
	purgeProfileSpy: ReturnType<typeof spyOn>
	trackEventSpy: ReturnType<typeof spyOn>
} {
	// member-1, member-2, and the owner are on the Topic's team, and admin-1 is an admin
	stubConnectionPool(({ text, values }) => {
		if (text.includes('from "team_members"')) {
			const ownerMembership = ["owner-1", "leader"]
			const memberId = values.find((value) => value === "member-1" || value === "member-2")
			return memberId ? [[memberId, "member"], ownerMembership] : [ownerMembership]
		}
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	})

	// the post's read, its page, the day's limit, and a clean classification
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(topicPostRow)
	spyOn(topicPosts, "toTopicPostResponse").mockImplementation(
		async (_userId, readRow) => ({ id: readRow.topicPost.id }) as never,
	)
	spyOn(socialLimits, "countSocialWriteToday").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)

	// the workflows a publish and an edit start
	spyOn(temporalClient, "startTopicPostPublishWorkflow").mockResolvedValue()
	spyOn(temporalClient, "startTopicPostSummaryWorkflow").mockResolvedValue()
	return {
		saveSpy: spyOn(topicPostWrites, "saveTopicPost").mockResolvedValue({ status: "saved", version: 4 }),
		publishSpy: spyOn(topicPostWrites, "publishTopicPost").mockResolvedValue(true),
		deleteSpy: spyOn(topicPostWrites, "deleteTopicPost").mockResolvedValue(),
		// the caches a published post's delete clears
		clearHomeSpy: spyOn(homeOrder, "clearHomeCaches").mockResolvedValue(),
		purgeProfileSpy: spyOn(edgeCache, "purgeProfileAtEdge").mockResolvedValue(undefined),
		trackEventSpy: spyOn(analytics, "trackEvent").mockImplementation(() => {}),
	}
}

// a request as one user
const toUserApp = (userId: string): ReturnType<typeof toSignedInApp> => toSignedInApp(topicPostsRoute, userId)

// a save of a title and a body at a version
const toSave = (wordCount: number, version = 3): RequestInit =>
	toJsonRequest({ title: "Dialing in", html: toBodyHtml(wordCount), version }, "PUT")

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

test("an edit ten minutes after publishing is saved, and one at 16 minutes is locked", async () => {
	const { saveSpy, trackEventSpy } = stubTopicPostRoutes(toPublishedRow(10))
	const editedResponse = await toUserApp("member-1").request("/topic-posts/post-1", toSave(300))
	expect(editedResponse.status).toBe(200)
	expect(saveSpy).toHaveBeenCalledTimes(1)
	expect(trackEventSpy.mock.calls.at(-1)?.[0]).toBe("social_topic_post_edit")

	// the edit starts the summary's rewrite, named by the post alone
	expect(temporalClient.startTopicPostSummaryWorkflow).toHaveBeenCalledWith("post-1")

	// an edit keeps the 300 words
	const shortResponse = await toUserApp("member-1").request("/topic-posts/post-1", toSave(299))
	expect(shortResponse.status).toBe(400)

	// past the edit time the body stays as it is
	stubTopicPostRoutes(toPublishedRow(16))
	const lockedResponse = await toUserApp("member-1").request("/topic-posts/post-1", toSave(320))
	expect(lockedResponse.status).toBe(409)
	expect(await lockedResponse.json()).toEqual({ error: "locked" })
	expect(saveSpy).toHaveBeenCalledTimes(1)
})

test("an edit of a published post counts toward no daily limit, and its changed text is classified on every save", async () => {
	// the author is at the day's limit, ten minutes after publishing
	const { saveSpy } = stubTopicPostRoutes(toPublishedRow(10))
	const countSpy = spyOn(socialLimits, "countSocialWriteToday").mockResolvedValue(false)
	const classifySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)

	// two saves of a changed text are both written, and both classified
	expect((await toUserApp("member-1").request("/topic-posts/post-1", toSave(310))).status).toBe(200)
	expect((await toUserApp("member-1").request("/topic-posts/post-1", toSave(311))).status).toBe(200)
	expect(saveSpy).toHaveBeenCalledTimes(2)
	expect(classifySpy).toHaveBeenCalledTimes(2)
	expect(countSpy).not.toHaveBeenCalled()

	// a flagged edit is not written
	classifySpy.mockResolvedValue("harassment")
	expect((await toUserApp("member-1").request("/topic-posts/post-1", toSave(312))).status).toBe(422)
	expect(saveSpy).toHaveBeenCalledTimes(2)
})

test("an edit of a published post's formatting alone is neither classified nor summarized again", async () => {
	// the stored words in a heading in place of a paragraph
	const { saveSpy } = stubTopicPostRoutes(toPublishedRow(10))
	const classifySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)
	const headingHtml = toBodyHtml(320).replace("<p>", "<h2>").replace("</p>", "</h2>")
	const formattedResponse = await toUserApp("member-1").request(
		"/topic-posts/post-1",
		toJsonRequest({ title: "Dialing in", html: headingHtml, version: 3 }, "PUT"),
	)

	// the save is written with no classification and no summary rewrite
	expect(formattedResponse.status).toBe(200)
	expect(saveSpy).toHaveBeenCalledTimes(1)
	expect(classifySpy).not.toHaveBeenCalled()
	expect(temporalClient.startTopicPostSummaryWorkflow).not.toHaveBeenCalled()
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
