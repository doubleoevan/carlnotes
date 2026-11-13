// the edits of a published Topic Post: saved at any time, counted toward no daily limit, and classified only for the
// text an edit adds
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as socialLimits from "@carlnotes/db/socialLimits"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as moderation from "../moderation"
import { toJsonRequest } from "../testSession"
import { stubTopicPostRoutes, toBodyHtml, toPublishedRow, toSave, toUserApp } from "./topicPostsRouteTestFixtures"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

test("an edit ten minutes after publishing is saved, and so is one a month later", async () => {
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

	// an author edits a published post at any time
	stubTopicPostRoutes(toPublishedRow(30 * 24 * 60))
	const laterResponse = await toUserApp("member-1").request("/topic-posts/post-1", toSave(320))
	expect(laterResponse.status).toBe(200)
	expect(saveSpy).toHaveBeenCalledTimes(2)
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

test("an edit of a published post classifies its new paragraphs and alt texts alone, and an older version is never classified", async () => {
	// a published post with a uuid, so the body may show its images
	const topicPostId = crypto.randomUUID()
	const publishedRow = toPublishedRow(10)
	stubTopicPostRoutes({ ...publishedRow, topicPost: { ...publishedRow.topicPost, id: topicPostId } })
	const classifySpy = spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)

	// the stored body, then a new paragraph and an image with alt text after it
	const imagePath = toTopicPostBodyImagePath({ topicPostId, imageId: crypto.randomUUID() })
	const imageHtml = `<p><img src="${imagePath}" alt="A latte &amp; a cup" width="4" height="3" /></p>`
	const editedResponse = await toUserApp("member-1").request(
		`/topic-posts/${topicPostId}`,
		toJsonRequest(
			{ title: "Dialing in", html: `${toBodyHtml(320)}<p>A new thought</p>${imageHtml}`, version: 3 },
			"PUT",
		),
	)
	expect(editedResponse.status).toBe(200)
	expect(classifySpy.mock.calls[0]?.[0].text).toBe("A new thought\n\nA latte & a cup")

	// a save at an older version is a conflict before anything is classified
	classifySpy.mockClear()
	const staleResponse = await toUserApp("member-1").request(`/topic-posts/${topicPostId}`, toSave(330, 2))
	expect(staleResponse.status).toBe(409)
	expect(await staleResponse.json()).toEqual({ error: "conflict", version: 3 })
	expect(classifySpy).not.toHaveBeenCalled()
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
