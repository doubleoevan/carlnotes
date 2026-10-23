// setRating tests: a rating saves its topic's vectors again, and a failed vector save never fails the rating.
// recordView tests. every open counts among a finding's views
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { FREE_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as meanVectors from "@carlnotes/pipeline/meanVectors"
import * as monitoring from "@carlnotes/server/monitoring"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { recordView, setRating } from "./findingFeedback"

// the topic's owner, who may rate its findings
const OWNER_ID = "owner-1"

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
	expect(await setRating(OWNER_ID, "finding-1", "down", TEST_ANALYTICS_PROPERTIES)).toBe(true)

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
	expect(await setRating(OWNER_ID, "finding-1", null, TEST_ANALYTICS_PROPERTIES)).toBe(true)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "database", { topicId: "topic-1" })
})

// an open of the finding by its owner, counted among its views or past the count rate limit
function toOpen(isViewCounted: boolean): Parameters<typeof recordView>[0] {
	return { userId: OWNER_ID, findingId: "finding-1", analyticsProperties: TEST_ANALYTICS_PROPERTIES, isViewCounted }
}

// the rows an open's reads and writes return: the opened finding's row, then the rating test's rows for the rest
function toOpenRows(sentQueryText: string): unknown[] {
	return sentQueryText.startsWith('update "findings"') ? [["finding-1"]] : toRatingRows(sentQueryText)
}

test("an open counts a view, then records its view event", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toOpenRows(sentQuery.text))
	expect(await recordView(toOpen(true))).toBe(true)

	// the count adds one, and the open's view event follows it
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const countIndex = queryTexts.findIndex((queryText) =>
		queryText.includes('"view_count" = "findings"."view_count" + 1'),
	)
	const openIndex = queryTexts.findIndex((queryText) => queryText.startsWith('insert into "finding_views"'))
	expect(countIndex).toBeGreaterThan(-1)
	expect(openIndex).toBeGreaterThan(countIndex)
})

test("an open of a finding deleted since the visibility check records nothing", async () => {
	// the count finds no finding row
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith('update "findings"') ? [] : toOpenRows(sentQuery.text),
	)
	expect(await recordView(toOpen(true))).toBe(false)

	// no view event, and no consumed row
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	expect(queryTexts.some((queryText) => queryText.startsWith("insert into"))).toBe(false)
})

test("an open past the count rate limit marks the finding read and counts no view", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toOpenRows(sentQuery.text))
	expect(await recordView(toOpen(false))).toBe(true)

	// no count and no view event, and the consumed row is written
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	expect(queryTexts.some((queryText) => queryText.startsWith('update "findings"'))).toBe(false)
	expect(queryTexts.some((queryText) => queryText.startsWith('insert into "finding_views"'))).toBe(false)
	expect(queryTexts.some((queryText) => queryText.startsWith('insert into "consumptions"'))).toBe(true)
})
