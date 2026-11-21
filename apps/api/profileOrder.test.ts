// profile order route tests: only a topic's owner features it or its ready film, only while it is public, only a Topic
// Post's author features it, only once it is published on a public topic, and each rejection changes nothing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as analytics from "@carlnotes/server/analytics"
import * as edgeCache from "./edgeCache"
import { profileOrderRoute } from "./profileOrder"
import { toSignedInApp } from "./testSession"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a topic row in the gated columns' order, with its owner and its visibility, and the count of its owner's featured items
function stubTopicRow(
	ownerId: string,
	visibility: "public" | "private",
	featuredCount = 0,
): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// how many topics the owner has featured
		if (text.includes("count(*)")) {
			return [[featuredCount]]
		}

		// the topic holds no profile order yet, and a write returns no row
		if (text.includes('"profile_order"')) {
			return text.startsWith("select") ? [[null]] : []
		}
		return text.includes('from "topics"') ? [["topic-1", ownerId, visibility, null]] : []
	})
}

// send a position for the topic as the given user, or as a visitor
function sendTopicProfileOrder(userId: string | null, position: number): Response | Promise<Response> {
	const app = userId ? toSignedInApp(profileOrderRoute, userId) : profileOrderRoute
	return app.request("/topics/topic-1/profile-order", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position }),
	})
}

test("the owner features their public topic", async () => {
	const sentQueries = stubTopicRow("owner-1", "public")
	const response = await sendTopicProfileOrder("owner-1", 1)
	expect(response.status).toBe(200)
	expect(sentQueries.some(({ text }) => text.startsWith('update "topics" set "profile_order" = $1'))).toBe(true)
})

test("a visitor is unauthorized, and another user is told the topic is missing", async () => {
	const sentQueries = stubTopicRow("owner-1", "public")
	expect((await sendTopicProfileOrder(null, 1)).status).toBe(401)
	expect((await sendTopicProfileOrder("user-2", 1)).status).toBe(404)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("a topic that is not public is rejected as a conflict", async () => {
	const sentQueries = stubTopicRow("owner-1", "private")
	expect((await sendTopicProfileOrder("owner-1", 1)).status).toBe(409)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("a thirteenth featured item is rejected as a conflict", async () => {
	const sentQueries = stubTopicRow("owner-1", "public", 12)
	expect((await sendTopicProfileOrder("owner-1", 13)).status).toBe(409)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

// a Topic Post row with its author, its published time, and its topic's visibility, and the count of its author's featured items
function stubTopicPostRow({
	publishedAt = "2026-11-09 12:00:00+00",
	visibility = "public",
	featuredCount = 0,
}: {
	publishedAt?: string | null
	visibility?: "public" | "private"
	featuredCount?: number
} = {}): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// how many Topic Posts the author has featured
		if (text.includes("count(*)")) {
			return [[featuredCount]]
		}

		// the post's author, published time, and topic's visibility
		if (text.includes('inner join "topics"')) {
			return [["author-1", publishedAt, visibility]]
		}

		// the post holds no profile order yet, and a write returns no row
		return text.startsWith("select") ? [[null]] : []
	})
}

// send a position for the Topic Post as the given user, or as a visitor
function sendTopicPostProfileOrder(userId: string | null, position: number): Response | Promise<Response> {
	const app = userId ? toSignedInApp(profileOrderRoute, userId) : profileOrderRoute
	return app.request("/topic-posts/post-1/profile-order", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position }),
	})
}

test("the author features their published Topic Post of a public topic, inside their own featured items", async () => {
	const sentQueries = stubTopicPostRow()
	expect((await sendTopicPostProfileOrder("author-1", 1)).status).toBe(200)
	const orderWrite = sentQueries.find(({ text }) => text.startsWith('update "topic_posts" set "profile_order" = $1'))
	expect(orderWrite?.values[0]).toBe(1)
	expect(sentQueries.some(({ text }) => text.includes('"topic_posts"."author_user_id" = $1'))).toBe(true)
})

test("a visitor is unauthorized, and anyone but the author is told the Topic Post is missing", async () => {
	const sentQueries = stubTopicPostRow()
	expect((await sendTopicPostProfileOrder(null, 1)).status).toBe(401)
	expect((await sendTopicPostProfileOrder("owner-1", 1)).status).toBe(404)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("a draft and a Topic Post of a topic that is not public are each a conflict", async () => {
	// a draft has no published time
	const draftQueries = stubTopicPostRow({ publishedAt: null })
	expect((await sendTopicPostProfileOrder("author-1", 1)).status).toBe(409)
	expect(draftQueries.some(({ text }) => text.startsWith("update"))).toBe(false)

	// a published post of a private topic
	const privateQueries = stubTopicPostRow({ visibility: "private" })
	expect((await sendTopicPostProfileOrder("author-1", 1)).status).toBe(409)
	expect(privateQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("an author's featured Topic Posts have no limit, so a thirteenth featured item is set", async () => {
	// the author already holds twelve featured items, and the thirteenth takes the next position
	const sentQueries = stubTopicPostRow({ featuredCount: 12 })
	expect((await sendTopicPostProfileOrder("author-1", 13)).status).toBe(200)
	const orderWrite = sentQueries.find(({ text }) => text.startsWith('update "topic_posts" set "profile_order" = $1'))
	expect(orderWrite?.values[0]).toBe(13)
})

// a film row with its status, its podcast episode's status, and its topic in the gated columns' order, and the count of
// its topic owner's featured films
function stubTopicVideoRow({
	status = "ready",
	podcastEpisodeStatus = "published",
	visibility = "public",
	featuredCount = 0,
}: {
	status?: "rendering" | "ready" | "failed"
	podcastEpisodeStatus?: "published" | "removed"
	visibility?: "public" | "private"
	featuredCount?: number
} = {}): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// how many films the owner has featured
		if (text.includes("count(*)")) {
			return [[featuredCount]]
		}

		// the film with its podcast episode's status and its topic
		if (text.includes('inner join "topics"')) {
			return [["film-1", status, podcastEpisodeStatus, "topic-1", "owner-1", visibility, null]]
		}

		// the film holds no profile order yet, and a write returns no row
		return text.startsWith("select") ? [[null]] : []
	})
}

// send a position for the film of a podcast episode as the given user, or as a visitor
function sendTopicVideoProfileOrder(userId: string | null, position: number): Response | Promise<Response> {
	const app = userId ? toSignedInApp(profileOrderRoute, userId) : profileOrderRoute
	return app.request("/podcast-episodes/episode-1/video/profile-order", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ position }),
	})
}

test("the owner features their ready film of a public topic, which purges their profile and reports ids alone", async () => {
	// the purge and the event the request sends
	const purgeProfileSpy = spyOn(edgeCache, "clearProfilePage").mockResolvedValue(undefined)
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const sentQueries = stubTopicVideoRow()
	expect((await sendTopicVideoProfileOrder("owner-1", 2)).status).toBe(200)

	// the film is found by its podcast episode, and the write names the film's own row
	expect(sentQueries[0]?.values).toEqual(["episode-1"])
	const orderWrite = sentQueries.find(({ text }) => text.startsWith('update "topic_videos" set "profile_order" = $1'))
	expect(orderWrite?.values[0]).toBe(1)
	expect(orderWrite?.values.at(-1)).toBe("film-1")

	// the owner's profile is purged, and the event names the film kind, the podcast episode, and the position
	expect(purgeProfileSpy).toHaveBeenCalledWith("owner-1")
	const [eventName, eventUserId, eventProperties] = trackEventSpy.mock.calls[0] ?? []
	expect([eventName, eventUserId]).toEqual(["social_profile_order_change", "owner-1"])
	expect(eventProperties).toMatchObject({ kind: "topicVideo", objectId: "episode-1", position: 2 })
})

test("a visitor is unauthorized, and anyone but the topic's owner is told the film is missing", async () => {
	const purgeProfileSpy = spyOn(edgeCache, "clearProfilePage").mockResolvedValue(undefined)
	const sentQueries = stubTopicVideoRow()
	expect((await sendTopicVideoProfileOrder(null, 1)).status).toBe(401)
	expect((await sendTopicVideoProfileOrder("user-2", 1)).status).toBe(404)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	expect(purgeProfileSpy).not.toHaveBeenCalled()
})

test("a film still rendering, a removed podcast episode's, a private topic's, and a thirteenth are each a conflict", async () => {
	// each film the rules keep off a profile, and a profile that already holds twelve featured films
	const purgeProfileSpy = spyOn(edgeCache, "clearProfilePage").mockResolvedValue(undefined)
	const rejectedFilmRows = [
		{ status: "rendering" as const },
		{ podcastEpisodeStatus: "removed" as const },
		{ visibility: "private" as const },
		{ featuredCount: 12 },
	]
	for (const rejectedFilmRow of rejectedFilmRows) {
		const sentQueries = stubTopicVideoRow(rejectedFilmRow)
		expect((await sendTopicVideoProfileOrder("owner-1", 13)).status).toBe(409)
		expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
	}
	expect(purgeProfileSpy).not.toHaveBeenCalled()
})
