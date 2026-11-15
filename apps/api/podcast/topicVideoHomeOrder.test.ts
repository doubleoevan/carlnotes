// the home films' order route: only an admin may feature, and only a ready film of a public topic
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as analytics from "@carlnotes/server/analytics"
import * as authorization from "../authorization"
import { toSignedInApp } from "../testSession"
import * as topicHomeOrder from "../topic/homeOrder"
import { topicVideoHomeOrderRoute } from "./topicVideoHomeOrder"

// the film read's row in its select order: the film's id, its status, its podcast episode's status, and its topic's id
// if the topic is public and shown
const READY_PUBLIC_FILM_ROW = ["film-1", "ready", "published", "topic-1"]

// a request that features the film at the second position
const FEATURE_REQUEST = {
	method: "PATCH",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ position: 2 }),
}

// keep the home caches and the analytics client out of the tests
beforeEach(() => {
	spyOn(topicHomeOrder, "clearHomeCaches").mockResolvedValue(undefined)
})

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// send the request as a user the authorization check allows or denies, with the film read returning the row given
async function sendFeature({
	isAdmin,
	filmRow,
}: {
	isAdmin: boolean
	filmRow: unknown[] | null
}): Promise<{ status: number; sentQueries: SentQuery[]; trackEvent: ReturnType<typeof spyOn> }> {
	// the authorization check, the event, and the film read, which every later write answers with nothing
	spyOn(authorization, "isAllowed").mockResolvedValue(isAdmin)
	const trackEvent = spyOn(analytics, "trackEvent").mockReturnValue(undefined)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith('select "topic_videos"."id"')) {
			return filmRow ? [filmRow] : []
		}
		return [[0]]
	})

	// the request, as a signed-in user
	const app = toSignedInApp(topicVideoHomeOrderRoute, "user-1")
	const response = await app.request("/podcast-episodes/episode-1/video/home-order", FEATURE_REQUEST)
	return { status: response.status, sentQueries, trackEvent }
}

test("an admin features a ready film of a public topic and reports the change by ids", async () => {
	const { status, sentQueries, trackEvent } = await sendFeature({ isAdmin: true, filmRow: READY_PUBLIC_FILM_ROW })
	expect(status).toBe(200)

	// the film takes its position among the home films
	expect(sentQueries.some(({ text }) => text.startsWith('update "topic_videos" set "home_order" = $1'))).toBe(true)
	expect(trackEvent).toHaveBeenCalledWith("episode_video_home_order_change", "user-1", {
		podcastEpisodeId: "episode-1",
		position: 2,
	})
})

test("anyone but an admin is refused before the film is read", async () => {
	const { status, sentQueries, trackEvent } = await sendFeature({ isAdmin: false, filmRow: READY_PUBLIC_FILM_ROW })
	expect(status).toBe(403)
	expect(sentQueries).toHaveLength(0)
	expect(trackEvent).not.toHaveBeenCalled()
})

test("a private topic's film stays off the home", async () => {
	const { status, trackEvent } = await sendFeature({ isAdmin: true, filmRow: ["film-1", "ready", "published", null] })
	expect(status).toBe(409)
	expect(trackEvent).not.toHaveBeenCalled()
})

test("a film that is not ready stays off the home", async () => {
	const { status } = await sendFeature({ isAdmin: true, filmRow: ["film-1", "rendering", "published", "topic-1"] })
	expect(status).toBe(409)
})

test("a podcast episode with no film is not found", async () => {
	const { status } = await sendFeature({ isAdmin: true, filmRow: null })
	expect(status).toBe(404)
})
