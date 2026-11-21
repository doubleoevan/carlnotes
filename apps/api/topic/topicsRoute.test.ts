// topic route tests: a visitor's hidden topic page responds 403 with the gate for an invite topic alone, and 404 for a
// private or missing one. the related topics read returns the list the page holds, a signed-in page that asks for the
// separate read leaves the list out, and a hidden topic's related topics read responds as its page does. a page read
// holds every Topic Post unless it asks for pages, and a visitor's read with no flag holds the whole history. an
// unchecked upload on a topic shows on the topic's page to the editor who uploaded it alone, and never in another
// user's poll or the visitors' cached page
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicImageUrls, toUncheckedTopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import type { TopicResponse, TopicScan } from "@carlnotes/contracts/topics"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toTableRow,
} from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { topics } from "@carlnotes/db/schema/topics"
import { uncheckedImages } from "@carlnotes/db/schema/uncheckedImages"
import * as visitorPageCaches from "@carlnotes/db/visitorPageCaches"
import { toTestPageHead } from "../pageReadTestFixtures"
import * as pageHead from "../share/pageHead"
import { toSignedInApp } from "../testSession"
import * as accessibleFindings from "./accessibleFindings"
import * as helpers from "./helpers"
import { stubRedisClientWithCentroid } from "./relatednessTestFixtures"
import * as topicPageRead from "./topicPageRead"
import * as topicScansPage from "./topicScansPage"
import { topicsRoute } from "./topicsRoute"
import { isTopicWithOwnerRead, TEAM_MEMBER_ROWS, toTopicWithOwnerRow } from "./topicTestFixtures"

// a visitor's topic page is read from the topic's page read, whose head these tests do not build, through a Redis of
// each test's own
beforeEach(() => {
	spyOn(pageHead, "loadTopicPageHead").mockResolvedValue(toTestPageHead("Coffee"))
	stubRedisClient()
})

// put the spies, the connection pool, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// only an invite topic's gate is shown, and a private topic looks missing
test("a visitor's hidden topic page is a 403 gate for an invite topic and a 404 for a private one", async () => {
	// a visitor's page read that finds nothing visible, and an invite topic's gate
	spyOn(topicPageRead, "readVisitorTopicPage").mockResolvedValue(null)
	const loadTopicGateResponseSpy = spyOn(helpers, "loadTopicGateResponse").mockResolvedValue({
		error: "forbidden",
		gatedVisibility: "invite",
		topicName: "Coffee",
	})

	// an invite topic's gate names the topic
	const inviteResponse = await topicsRoute.request("/topics/t1")
	expect(inviteResponse.status).toBe(403)
	expect(await inviteResponse.json()).toEqual({ error: "forbidden", gatedVisibility: "invite", topicName: "Coffee" })

	// a private topic has no gate, like a missing one, and reads as missing
	loadTopicGateResponseSpy.mockResolvedValue(null)
	const privateResponse = await topicsRoute.request("/topics/t1")
	expect(privateResponse.status).toBe(404)
	expect(await privateResponse.json()).toEqual({ error: "not found" })
})

// a topic owned by owner-1 with the fields its page reads, public unless a test names another visibility, with any
// other field a test names
function toPageTopicRow(
	visibility: "public" | "private" | "invite" = "public",
	topicFields: Record<string, unknown> = {},
): unknown[] {
	return toTableRow(topics, {
		id: "topic-1",
		ownerId: "owner-1",
		name: "Agents",
		prompt: "agents",
		// the schedule and the limits
		frequency: "daily",
		scheduledTime: "09:00:00",
		scheduledDayOfWeek: "monday",
		visibility,
		tags: [],
		maxTopicFindings: 10,
		subscriberCount: 3,
		createdAt: new Date("2026-10-01T00:00:00Z"),
		updatedAt: new Date("2026-10-01T00:00:00Z"),
		...topicFields,
	})
}

// the read of a page's related topic ids, in either ranking
function isRelatedTopicsRead(sentQuery: SentQuery): boolean {
	return sentQuery.text.includes('from "topic_vectors"')
}

// the page's related topics field of a response
async function readRelatedTopics(response: Response): Promise<unknown> {
	return ((await response.json()) as { relatedTopics: unknown }).relatedTopics
}

// the related topics load apart from a signed-in page, and stay on a visitor's
test("the related topics read returns the page's list, which a signed-in page leaves out on request", async () => {
	// public topic-1, a free user, and topic-2 ranked as its one related topic
	stubRedisClientWithCentroid()
	const sentQueries = stubConnectionPool(({ text }) => {
		// the public ranking, and no ranking of the user's own. each names the page's topic, so they are matched first
		if (text.startsWith('with "related_topic_candidates"')) {
			return [["topic-2", 0.2]]
		}
		if (text.includes('from "topic_vectors"')) {
			return []
		}

		// the page's topic with its owner, and each user's access row
		if (isTopicWithOwnerRead(text)) {
			return [toTopicWithOwnerRow(toPageTopicRow(), "owner-1")]
		}
		if (text.includes('"budget_override_cents" from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}

		// the ranked topic as it stands now
		return text.includes('from "topics" where ("topics"."id" in (')
			? [["topic-2", "Espresso", "owner-2", "public", null]]
			: []
	})
	const signedInApp = toSignedInApp(topicsRoute, "user-1")

	// a page with no flag holds the list, and the related topics read returns the same list
	const pageRelatedTopics = await readRelatedTopics(await signedInApp.request("/topics/topic-1"))
	expect(pageRelatedTopics).toEqual([{ id: "topic-2", name: "Espresso", latestPodcastEpisode: null }])
	const relatedTopicsResponse = await signedInApp.request("/topics/topic-1/related-topics")
	expect(relatedTopicsResponse.status).toBe(200)
	expect(await relatedTopicsResponse.json()).toEqual({ relatedTopics: pageRelatedTopics })

	// a signed-in page with the flag sends no related read and holds an empty list
	const queryCountBeforeFlag = sentQueries.length
	const flaggedPageResponse = await signedInApp.request("/topics/topic-1?related=separate")
	expect(flaggedPageResponse.status).toBe(200)
	expect(await readRelatedTopics(flaggedPageResponse)).toEqual([])
	expect(sentQueries.slice(queryCountBeforeFlag).filter(isRelatedTopicsRead)).toHaveLength(0)

	// a visitor's page holds the list with or without the flag
	expect(await readRelatedTopics(await topicsRoute.request("/topics/topic-1?related=separate"))).toEqual(
		pageRelatedTopics,
	)
})

// a request that asks for pages holds one page of the Topic Posts, and one that does not holds every post
test("a topic page read holds every Topic Post unless it asks for pages, and then one page with where it sits", async () => {
	// a visitor's topic page with eight Topic Posts
	const topicPostCards = Array.from({ length: 8 }, (_, i) => ({ id: `post-${i}` }) as TopicPostCard)
	spyOn(topicPageRead, "readVisitorTopicPage").mockResolvedValue({
		id: "topic-1",
		topicPosts: { topicPosts: topicPostCards, canPublish: false },
	} as TopicResponse)

	// a request with no pages holds every post and no position
	const wholeTopicPage = (await (await topicsRoute.request("/topics/topic-1")).json()) as TopicResponse
	expect(wholeTopicPage.topicPosts?.topicPosts).toHaveLength(8)
	expect(wholeTopicPage.topicPostsPage).toBeUndefined()

	// a paged request holds the page it names and where that page sits
	const pagedResponse = await topicsRoute.request("/topics/topic-1?paged=1&topicPostsPage=1")
	const pagedTopicPage = (await pagedResponse.json()) as TopicResponse
	expect(pagedTopicPage.topicPosts?.topicPosts.map(({ id }) => id)).toEqual(["post-6", "post-7"])
	expect(pagedTopicPage.topicPostsPage).toEqual({ page: 1, totalCount: 8 })
})

// a visitor's copy holds the newest page of scans. a released read with no flag gets the whole history, read past the
// copy's page if the history lists more, and a flagged read gets the copy's page with the count
test("a visitor's read past the copy's newest scans gets the whole history unless it asks for the newest", async () => {
	// a copy that holds one scan of a history of three, and the whole history's read
	const toScan = (id: string): TopicScan => ({ id }) as TopicScan
	spyOn(visitorPageCaches, "readVisitorPage").mockResolvedValue({
		head: toTestPageHead("Coffee"),
		topic: { id: "topic-1", scans: [toScan("scan-1")], scansPage: { page: 0, totalCount: 3 } } as TopicResponse,
		topicGate: null,
	})
	spyOn(accessibleFindings, "loadViewableTopic").mockResolvedValue(toTableRow(topics, {}) as never)
	const loadTopicScansPageSpy = spyOn(topicScansPage, "loadTopicScansPage").mockResolvedValue({
		scans: ["scan-1", "scan-2", "scan-3"].map(toScan),
		totalCount: 3,
	})

	// a read with no flag holds the three scans and no page
	const wholeTopicPage = (await (await topicsRoute.request("/topics/topic-1")).json()) as TopicResponse
	expect(wholeTopicPage.scans.map(({ id }) => id)).toEqual(["scan-1", "scan-2", "scan-3"])
	expect(wholeTopicPage.scansPage).toBeUndefined()
	expect(loadTopicScansPageSpy.mock.calls[0]?.[0].page).toBeUndefined()

	// a flagged read holds the copy's page and the count, with no scan read
	const newestTopicPage = (await (await topicsRoute.request("/topics/topic-1?scans=newest")).json()) as TopicResponse
	expect(newestTopicPage.scans.map(({ id }) => id)).toEqual(["scan-1"])
	expect(newestTopicPage.scansPage).toEqual({ page: 0, totalCount: 3 })
	expect(loadTopicScansPageSpy).toHaveBeenCalledTimes(1)
})

// a topic the reader may not see gets the same response from its related topics read as from its page
test("a hidden topic's related topics read is the page's 403 gate or 404", async () => {
	// a private topic of someone else's, which a stranger may not see
	stubRedisClient()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topics"')) {
			return [toPageTopicRow("private")]
		}
		return text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : []
	})

	// the gate that the hidden topic's reads respond with, and a signed-in stranger
	const topicGate = { error: "forbidden", gatedVisibility: "invite", topicName: "Coffee" } as const
	const loadTopicGateResponseSpy = spyOn(helpers, "loadTopicGateResponse").mockResolvedValue(topicGate)
	const strangerApp = toSignedInApp(topicsRoute, "stranger-1")

	// the gate of an invite topic from both reads
	for (const path of ["/topics/topic-1", "/topics/topic-1/related-topics"]) {
		const gatedResponse = await strangerApp.request(path)
		expect(gatedResponse.status).toBe(403)
		expect(await gatedResponse.json()).toEqual(topicGate)
	}

	// a private topic has no gate, and reads as missing from both
	loadTopicGateResponseSpy.mockResolvedValue(null)
	for (const path of ["/topics/topic-1", "/topics/topic-1/related-topics"]) {
		const missingResponse = await strangerApp.request(path)
		expect(missingResponse.status).toBe(404)
		expect(await missingResponse.json()).toEqual({ error: "not found" })
	}

	// neither read ranked a related topic
	expect(sentQueries.filter(isRelatedTopicsRead)).toHaveLength(0)
})

// the hash of topic-1's published image, and of member-1's unchecked upload over it
const PUBLISHED_IMAGE_HASH = "published-hash"
const UNCHECKED_IMAGE_HASH = "unchecked-hash"

// stub the connection pool to return public topic-1 with the given published image, owned by owner-1 on team-1,
// every user as a free user, the team's members, and member-1's unchecked upload unless the test names none. return
// each query sent
function stubTopicImages(
	publishedImageHash: string,
	uncheckedImageHash: string | null = UNCHECKED_IMAGE_HASH,
): SentQuery[] {
	stubRedisClientWithCentroid()
	const topicRow = toPageTopicRow("public", { teamId: "team-1", imageHash: publishedImageHash })
	const uncheckedImageRow = toTableRow(uncheckedImages, {
		subjectKind: "topicImage",
		subjectId: "topic-1",
		uploaderUserId: "member-1",
		imageHash: uncheckedImageHash,
	})
	return stubConnectionPool(({ text, values }) => {
		// the unchecked image, which the read of the user who uploaded it finds
		if (text.includes('from "unchecked_images"')) {
			return uncheckedImageHash && values.includes("member-1") ? [uncheckedImageRow] : []
		}

		// the page's topic with its owner, and each user's access row
		if (isTopicWithOwnerRead(text)) {
			return [toTopicWithOwnerRow(topicRow, "owner-1")]
		}
		if (text.includes('"budget_override_cents" from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}

		// the owning team's members among the users the edit check names
		return text.startsWith('select "user_id", "role" from "team_members"')
			? TEAM_MEMBER_ROWS.filter(([userId]) => values.includes(userId))
			: []
	})
}

// the image fields of topic-1's page as the given user reads it, or as a visitor for null, on a page load or a poll
async function readTopicImageFields(
	userId: string | null,
	path = "/topics/topic-1?related=separate",
): Promise<{ response: Response; image: unknown; isImageUnchecked: unknown; imageOrigin: unknown }> {
	const app = userId ? toSignedInApp(topicsRoute, userId) : topicsRoute
	const response = await app.request(path)
	const { image, isImageUnchecked, imageOrigin } = (await response.clone().json()) as Record<string, unknown>
	return { response, image, isImageUnchecked, imageOrigin }
}

// an unchecked upload on a public topic shows on the topic's page to the editor who uploaded it, and to nobody else
test("an unchecked topic image shows on the topic's page to its uploader alone", async () => {
	const sentQueries = stubTopicImages(PUBLISHED_IMAGE_HASH)
	const uncheckedImage = toUncheckedTopicImageUrls(toTopicImageUrls("topic-1", UNCHECKED_IMAGE_HASH))
	const publishedImage = toTopicImageUrls("topic-1", PUBLISHED_IMAGE_HASH)

	// the uploader reads the unchecked upload with its flag, in a response that names no shared cache
	const uploaderPage = await readTopicImageFields("member-1")
	expect(uploaderPage.response.status).toBe(200)
	expect(uploaderPage).toMatchObject({ image: uncheckedImage, isImageUnchecked: true, imageOrigin: "uploaded" })
	expect(uploaderPage.response.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderPage.response.headers.get("cache-tag")).toBeNull()

	// a second editor, a user who may not edit, and a visitor each read the published image with no flag
	for (const userId of ["owner-1", "stranger-1", null]) {
		const page = await readTopicImageFields(userId)
		expect(page.response.status).toBe(200)
		expect(page.image).toEqual(publishedImage)
		expect(page.isImageUnchecked).toBeUndefined()
	}

	// only the two editors' reads looked for an unchecked image
	const uncheckedImageReads = sentQueries.filter(({ text }) => text.includes('from "unchecked_images"'))
	expect(uncheckedImageReads.map(({ values }) => values[2])).toEqual(["member-1", "owner-1"])
})

// a poll's cached page is its own user's, and the visitors' cached page is read with no unchecked image
test("an unchecked topic image never reaches another user's poll or the visitors' cached page", async () => {
	const sentQueries = stubTopicImages(PUBLISHED_IMAGE_HASH)
	const uncheckedImage = toUncheckedTopicImageUrls(toTopicImageUrls("topic-1", UNCHECKED_IMAGE_HASH))
	const uncheckedImageFields = { image: uncheckedImage, isImageUnchecked: true }
	const publishedImage = toTopicImageUrls("topic-1", PUBLISHED_IMAGE_HASH)
	const pollPath = "/topics/topic-1?poll=1"

	// the uploader's poll caches the unchecked upload for the uploader, who reads it again from the cache with no query
	expect(await readTopicImageFields("member-1", pollPath)).toMatchObject(uncheckedImageFields)
	const queryCountAfterFirstPoll = sentQueries.length
	expect(await readTopicImageFields("member-1", pollPath)).toMatchObject(uncheckedImageFields)
	expect(sentQueries).toHaveLength(queryCountAfterFirstPoll)

	// a second editor's poll, a visitor's poll, and the visitors' cached page all read the published image
	const laterReads = [
		await readTopicImageFields("owner-1", pollPath),
		await readTopicImageFields(null, pollPath),
		await readTopicImageFields(null, "/topics/topic-1"),
		await readTopicImageFields(null, "/topics/topic-1"),
	]
	for (const laterRead of laterReads) {
		expect(laterRead.image).toEqual(publishedImage)
		expect(laterRead.isImageUnchecked).toBeUndefined()
	}
})

// once an unchecked upload is published it is the topic's image, read at its plain urls like any published image
test("an unchecked upload that was published reads at its plain urls with no flag, for its uploader too", async () => {
	stubTopicImages(UNCHECKED_IMAGE_HASH, null)

	// the uploader and a visitor read the same image, at urls with no unchecked mark
	for (const userId of ["member-1", null]) {
		const page = await readTopicImageFields(userId)
		expect(page.image).toEqual(toTopicImageUrls("topic-1", UNCHECKED_IMAGE_HASH))
		expect(JSON.stringify(page.image)).not.toContain("unchecked=1")
		expect(page.isImageUnchecked).toBeUndefined()
	}
})
