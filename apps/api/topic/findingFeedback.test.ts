// setRating tests: a rating saves its topic's vectors again, and a failed vector save never fails the rating.
// recordView tests. a user counts among a finding's viewers on the first open only
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

// the rows an open's reads return: the locked finding row, and the user's earlier open if they have one
function toOpenRows(sentQueryText: string, hasEarlierOpen: boolean): unknown[] {
	if (sentQueryText.includes("for no key update")) {
		return [["finding-1"]]
	}

	// the user's earlier open, then the rating test's rows for the rest
	if (sentQueryText.includes('from "finding_views"')) {
		return hasEarlierOpen ? [["view-1"]] : []
	}
	return toRatingRows(sentQueryText)
}

test("a first open counts the user among the viewers, after locking the finding row", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toOpenRows(sentQuery.text, false))
	expect(await recordView(OWNER_ID, "finding-1", TEST_ANALYTICS_PROPERTIES)).toBe(true)

	// the lock comes first, then the count, then the open's view event
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	const lockIndex = queryTexts.findIndex((queryText) => queryText.includes("for no key update"))
	const countIndex = queryTexts.findIndex((queryText) => queryText.includes('"viewer_count" = '))
	const openIndex = queryTexts.findIndex((queryText) => queryText.startsWith('insert into "finding_views"'))
	expect(lockIndex).toBeGreaterThan(-1)
	expect(countIndex).toBeGreaterThan(lockIndex)
	expect(openIndex).toBeGreaterThan(countIndex)
})

test("a repeat open records the open and counts nobody again", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toOpenRows(sentQuery.text, true))
	expect(await recordView(OWNER_ID, "finding-1", TEST_ANALYTICS_PROPERTIES)).toBe(true)

	// the open's view event is still written, and the viewer count is left alone
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	expect(queryTexts.some((queryText) => queryText.includes('"viewer_count" = '))).toBe(false)
	expect(queryTexts.some((queryText) => queryText.startsWith('insert into "finding_views"'))).toBe(true)
})

test("an open of a finding deleted since the visibility check records nothing", async () => {
	// the lock finds no finding row
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes("for no key update") ? [] : toOpenRows(sentQuery.text, false),
	)
	expect(await recordView(OWNER_ID, "finding-1", TEST_ANALYTICS_PROPERTIES)).toBe(false)

	// no count, no view event, and no consumed row
	const queryTexts = sentQueries.map((sentQuery) => sentQuery.text)
	expect(queryTexts.some((queryText) => queryText.includes('"viewer_count" = '))).toBe(false)
	expect(queryTexts.some((queryText) => queryText.startsWith("insert into"))).toBe(false)
})
