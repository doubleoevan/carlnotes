// scan email content tests: a digest's new Findings are the ones the Scan first found, never the ones it re-scored
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { toTopicScanEmailProps } from "./scanEmailContent"

// put the connection pool's own query back after each test
afterEach(restoreConnectionPool)

// a url Source's page is re-scored on every Scan, which moves its scan_id to that Scan, so the digest reads the Scan
// that first found each Finding
test("toTopicScanEmailProps reads the Scan's new Findings by the Scan that first found them", async () => {
	// one Finding this Scan first found, selected with its title, url, and explanation, and no podcast episode
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('"relevance_explanation"') && text.includes('"found_scan_id"')
			? [["A page", "https://a.com/1", "why it matters"]]
			: [],
	)
	const { subject, sharedProps } = await toTopicScanEmailProps(
		{ id: "topic-1", name: "Coffee gear" },
		{ id: "scan-1", status: "succeeded", scanSummary: null, error: null },
	)

	// the new Findings read names the found scan, never the latest review's scan
	const newFindingsQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('"relevance_explanation"'))
	expect(newFindingsQuery?.text).toContain('"findings"."found_scan_id" = $')
	expect(newFindingsQuery?.text).not.toContain('"findings"."scan_id"')
	expect(newFindingsQuery?.values).toContain("scan-1")

	// the subject counts the one new Finding, and the props list it
	expect(subject).toBe("Notes on Coffee gear: 1 finding")
	expect(sharedProps.findings).toEqual([
		{ title: "A page", url: "https://a.com/1", relevanceExplanation: "why it matters" },
	])
})
