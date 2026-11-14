// topic route tests: a visitor's hidden topic page responds 403 with the gate for an invite topic alone, and 404 for a
// private or missing one. the related topics read returns the list the page holds, a signed-in page that asks for the
// separate read leaves the list out, and a hidden topic's related topics read responds as its page does. a Source is
// removed by the owner or an owning team member, and by nobody else. an unchecked upload on a topic shows on the
// topic's page to the editor who uploaded it alone, and never in another user's poll or the visitors' cached page
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toTopicImageUrls, toUncheckedTopicImageUrls } from "@carlnotes/contracts/topicImages"
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
import { toSignedInApp } from "../testSession"
import * as feeds from "./feeds"
import * as helpers from "./helpers"
import { stubRedisClientWithCentroid } from "./relatednessTestFixtures"
import { topicsRoute } from "./topicsRoute"

// put the spies, the connection pool, and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	restoreRedisClient()
})

// only an invite topic's gate is shown, and a private topic looks missing
test("a visitor's hidden topic page is a 403 gate for an invite topic and a 404 for a private one", async () => {
	// a visitor's page read that finds nothing visible, and an invite topic's gate
	spyOn(feeds, "readVisitorTopicPage").mockResolvedValue(null)
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

		// the page's topic, and each user's access row
		if (text.includes('from "topics" where "topics"."id" = $1')) {
			return [toPageTopicRow()]
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

// the active members of team-1, which owns topic-1: its owner and member-1
const TEAM_MEMBER_ROWS = [
	["owner-1", "leader"],
	["member-1", "member"],
]

// stub the connection pool to return public topic-1, owned by owner-1 on team-1, every user as a free user, a Source
// of the given kind on the given topic, and the topic's source count. return each query sent
function stubTopicSourceRows(
	sourceTopicId: string,
	{ sourceKind = "reddit", sourceCount = 2 }: { sourceKind?: string; sourceCount?: number } = {},
): SentQuery[] {
	stubRedisClient()
	const topicRow = toTableRow(topics, { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: "team-1" })
	return stubConnectionPool(({ text, values }) => {
		// the topic, and each user's access row
		if (text.includes('from "topics"')) {
			return [topicRow]
		}
		if (text.includes('from "users"')) {
			return [FREE_USER_ACCESS_ROW]
		}

		// the owning team's members among the users the edit check names, and the topic's source count
		if (text.startsWith('select "user_id", "role" from "team_members"')) {
			return TEAM_MEMBER_ROWS.filter(([userId]) => values.includes(userId))
		}
		if (text.includes("count(")) {
			return [[sourceCount]]
		}

		// the Source row, and the same row read again under the topic row's lock
		if (text.startsWith('select "id" from "sources"')) {
			return [["source-1"]]
		}
		return text.startsWith('select "topic_id"') ? [[sourceTopicId, sourceKind, { subreddit: "startups" }]] : []
	})
}

// remove source-1 from topic-1 as the given user, or as a signed-out visitor for null
function sendRemoveTopicSource(userId: string | null): Promise<Response> {
	const app = userId ? toSignedInApp(topicsRoute, userId) : topicsRoute
	return Promise.resolve(app.request("/topics/topic-1/sources/source-1", { method: "DELETE" }))
}

// the Source delete among the sent queries
function findTopicSourceDelete(sentQueries: SentQuery[]): SentQuery | undefined {
	return sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "sources"'))
}

// the owner and an active member of the owning team may both edit the topic, so both remove its Source
test("the owner and an owning team member each remove a Source with a 204", async () => {
	for (const userId of ["owner-1", "member-1"]) {
		const sentQueries = stubTopicSourceRows("topic-1")
		const response = await sendRemoveTopicSource(userId)
		expect(response.status).toBe(204)
		expect(findTopicSourceDelete(sentQueries)?.values).toEqual(["source-1", "topic-1"])
	}
})

// a user and a visitor who may see the public topic but not edit it are forbidden, and nothing is deleted
test("a user who may not edit the topic and a signed-out visitor get a 403", async () => {
	for (const userId of ["stranger-1", null]) {
		const sentQueries = stubTopicSourceRows("topic-1")
		const response = await sendRemoveTopicSource(userId)
		expect(response.status).toBe(403)
		expect(findTopicSourceDelete(sentQueries)).toBeUndefined()
	}
})

// another topic's Source reads as missing, so the route never says it exists
test("removing another topic's Source returns 404 and deletes nothing", async () => {
	const sentQueries = stubTopicSourceRows("topic-2")
	const response = await sendRemoveTopicSource("owner-1")
	expect(response.status).toBe(404)
	expect(findTopicSourceDelete(sentQueries)).toBeUndefined()
})

// web search and a topic's last source stay, each a conflict naming the rule, and nothing is deleted
test("removing web search or a topic's last source returns 409 with the rule", async () => {
	const webSearchQueries = stubTopicSourceRows("topic-1", { sourceKind: "search" })
	const webSearchResponse = await sendRemoveTopicSource("owner-1")
	expect(webSearchResponse.status).toBe(409)
	expect(await webSearchResponse.json()).toEqual({ error: "webSearch" })
	expect(findTopicSourceDelete(webSearchQueries)).toBeUndefined()

	// the last source of a topic
	const lastSourceQueries = stubTopicSourceRows("topic-1", { sourceCount: 1 })
	const lastSourceResponse = await sendRemoveTopicSource("owner-1")
	expect(lastSourceResponse.status).toBe(409)
	expect(await lastSourceResponse.json()).toEqual({ error: "lastSource" })
	expect(findTopicSourceDelete(lastSourceQueries)).toBeUndefined()
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

		// the page's topic, and each user's access row
		if (text.includes('from "topics" where "topics"."id" = $1')) {
			return [topicRow]
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
