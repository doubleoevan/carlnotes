// setRating tests: a rating saves its topic's vectors again, and a failed vector save never fails the rating
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { FREE_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import * as meanVectors from "../../worker/meanVectors"
import type { AnalyticsProperties } from "../currentUser"
import { setRating } from "./findingMarks"

// the topic's owner, who may rate its findings, and the analytics properties a rating is tracked with
const OWNER_ID = "owner-1"
const ANALYTICS_PROPERTIES: AnalyticsProperties = {
	entryPoint: "web",
	plan: "free",
	platform: "desktop",
	browserPlatform: "other",
	isInAppBrowser: false,
}

// put the connection pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the rows a rating's reads and writes return: the finding's topic, the owner's access, the rated finding, and the
// topic's saved vector
function toRatingRows(sentQueryText: string): unknown[] {
	// the finding's topic for the permission check, and the owner's access
	if (sentQueryText.includes('inner join "scans"')) {
		return [["topic-1", OWNER_ID, "private", null, new Date()]]
	}
	if (sentQueryText.includes('from "users"')) {
		return [FREE_USER_ACCESS_ROW]
	}

	// the rated finding, and the topic's saved vector
	if (sentQueryText.startsWith('update "findings"')) {
		return [["topic-1"]]
	}
	return sentQueryText.startsWith('insert into "topic_vectors"') ? [["topic-1"]] : []
}

test("a rating saves its topic's vectors again after the finding's update", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toRatingRows(sentQuery.text))
	expect(await setRating(OWNER_ID, "finding-1", "down", ANALYTICS_PROPERTIES)).toBe(true)

	// the finding's update returns its topic, and the topic's vector upsert comes after it
	const updateIndex = sentQueries.findIndex((sentQuery) => sentQuery.text.startsWith('update "findings"'))
	const vectorSaveIndex = sentQueries.findIndex((sentQuery) => sentQuery.text.startsWith('insert into "topic_vectors"'))
	expect(sentQueries[updateIndex]?.text).toContain('returning "topic_id"')
	expect(vectorSaveIndex).toBeGreaterThan(updateIndex)
	expect(sentQueries[vectorSaveIndex]?.values).toContain("topic-1")
})

test("a failed vector save is reported and the rating still saves", async () => {
	// fail the vector save and silence the error report
	stubConnectionPool((sentQuery) => toRatingRows(sentQuery.text))
	spyOn(meanVectors, "saveTopicVectors").mockRejectedValue(new Error("database unreachable"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// the rating returns true, and the failure is reported with the topic
	expect(await setRating(OWNER_ID, "finding-1", null, ANALYTICS_PROPERTIES)).toBe(true)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "database", { topicId: "topic-1" })
})
