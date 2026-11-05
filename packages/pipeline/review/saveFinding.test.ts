import { expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { resources, scans } from "@carlnotes/db/schema/scans"
import { toFindingReviewFields, upsertFinding } from "./saveFinding"

// a re-score rewrites the review and nothing else, so a user's rating and view count survive it.
// without this an edited prompt would quietly clear a rating someone left
test("a review names only the columns a re-score decides", () => {
	const review = toFindingReviewFields({
		scanId: "scan-1",
		score: 0.82,
		relevanceExplanation: "why this matters",
		topicContextHash: "abc123",
		contentHash: "def456",
	})

	// the review's own columns, and no column a user writes
	expect(Object.keys(review).sort()).toEqual([
		"relevanceExplanation",
		"relevanceScore",
		"reviewedContentHash",
		"reviewedContextHash",
		"scanId",
	])
	for (const userColumn of ["rating", "ratedByUserId", "ratedTeamId", "ratedRole", "viewCount"]) {
		expect({ userColumn, isWritten: userColumn in review }).toEqual({ userColumn, isWritten: false })
	}
})

// the scan that first found a finding is written with the insert alone. a re-score moves scan_id to the re-scoring scan
// and leaves found_scan_id, so a re-scored finding is not new to the digest or the podcast episode's plan again
test("upsertFinding writes the found scan on the insert and never on the re-score", async () => {
	// a pool whose upsert returns an updated row
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('insert into "findings"') ? [["finding-1", false, 0.5]] : [],
	)
	try {
		// the re-scoring scan, the resource it scored, and the review it wrote
		const scan = { id: "scan-2" } as typeof scans.$inferSelect
		const resource = { id: "resource-1", contentHash: "content-hash" } as typeof resources.$inferSelect
		const review = { score: 0.5, relevanceExplanation: "why it matters", topicContextHash: "context-hash" }

		// re-score a finding an earlier scan found, which the pool reports as an updated row
		const upsertFindingResult = await upsertFinding({
			scan,
			topicId: "topic-1",
			resource,
			...review,
			isFromCustomSource: false,
		})
		expect(upsertFindingResult).toEqual({ isNew: false, relevanceScore: 0.5 })

		// the insert names the found scan, and the conflict update names the latest scan alone
		const upsertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "findings"'))
		const [insertClause = "", updateClause = ""] = (upsertQuery?.text ?? "").split("on conflict")
		expect(insertClause).toContain('"found_scan_id"')
		expect(updateClause).toContain('"scan_id"')
		expect(updateClause).not.toContain('"found_scan_id"')
	} finally {
		// put the connection pool's own query back
		restoreConnectionPool()
	}
})

// a resource with no stored content hash is reviewed against no content hash instead of an empty string
test("a review keeps a null content hash null", () => {
	const review = toFindingReviewFields({
		scanId: "scan-1",
		score: 0.1,
		relevanceExplanation: "",
		topicContextHash: "abc123",
		contentHash: null,
	})
	expect(review.reviewedContentHash).toBe(null)
})
