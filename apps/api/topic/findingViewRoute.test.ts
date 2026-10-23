// finding view route tests: a visitor's open returns 204 and counts a view only from a person on the app's own origin,
// and the count adds a view only to a finding a visitor may see
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as findingFeedback from "./findingFeedback"
import { countVisitorFindingView } from "./findingFeedback"
import * as findingPermissions from "./findingPermissions"
import { findingsRoute } from "./findings"

// a browser's and a crawler's same-origin requests, each with its address
const BROWSER_HEADERS = {
	"user-agent": "Mozilla/5.0 Firefox/130.0",
	"x-forwarded-for": "203.0.113.7",
	"sec-fetch-site": "same-origin",
}
const CRAWLER_HEADERS = { ...BROWSER_HEADERS, "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }

// the auth secret that keys a visitor's rate limit, set for each test and put back after
let savedAuthSecret: string | undefined

beforeEach(() => {
	savedAuthSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	stubRedisClient()
})

afterEach(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// post a visitor's open of the finding with the given headers
function postVisitorView(headers: Record<string, string>): Promise<Response> {
	return Promise.resolve(findingsRoute.request("/topic-findings/finding-1/view", { method: "POST", headers }))
}

test("a visitor's open from the app counts a view and returns 204", async () => {
	const countVisitorFindingViewSpy = spyOn(findingFeedback, "countVisitorFindingView").mockResolvedValue()
	const response = await postVisitorView(BROWSER_HEADERS)
	expect(response.status).toBe(204)
	expect(countVisitorFindingViewSpy).toHaveBeenCalledWith("finding-1")
})

test("a crawler's open and another website's open return 204 and count nothing", async () => {
	const countVisitorFindingViewSpy = spyOn(findingFeedback, "countVisitorFindingView").mockResolvedValue()
	const crawlerResponse = await postVisitorView(CRAWLER_HEADERS)
	const crossSiteResponse = await postVisitorView({ ...BROWSER_HEADERS, "sec-fetch-site": "cross-site" })
	expect([crawlerResponse.status, crossSiteResponse.status]).toEqual([204, 204])
	expect(countVisitorFindingViewSpy).not.toHaveBeenCalled()
})

test("a visitor's view adds one to a finding they may see, and nothing to one they may not", async () => {
	// a finding a visitor may see gets one more view
	const sentQueries = stubConnectionPool((sentQuery) => (sentQuery.text.startsWith('update "findings"') ? [["f"]] : []))
	const isTopicFindingVisibleSpy = spyOn(findingPermissions, "isTopicFindingVisible").mockResolvedValue(true)
	await countVisitorFindingView("finding-1")
	expect(isTopicFindingVisibleSpy).toHaveBeenCalledWith(null, "finding-1")
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes('"view_count" = "findings"."view_count" + 1'))).toBe(
		true,
	)

	// a finding on a topic a visitor may not see is left alone
	const hiddenQueries = stubConnectionPool()
	isTopicFindingVisibleSpy.mockResolvedValue(false)
	await countVisitorFindingView("finding-2")
	expect(hiddenQueries.some((sentQuery) => sentQuery.text.startsWith('update "findings"'))).toBe(false)
})
