// admin report tests: the open list shapes each report with its people and whether its content is gone, Keep closes a
// report without touching the content, and Remove deletes a comment through the comment delete before closing
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import type { Context } from "hono"
import { loadOpenReports, resolveReport } from "./adminReports"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// one open report row as the list's read selects it: the report, then the reporter and the author
const OPEN_REPORT_ROW = [
	"report-1",
	"noteComment",
	"c1",
	"you smell",
	"/topics/topic-1/raccoons",
	"rude",
	"2026-10-29T10:00:00.000Z",
	"user-1",
	"doubleoevan",
	"user-2",
	"vienna",
]

// the list shapes the report, and a comment that no longer exists shows as gone
test("the open list shapes each report and marks gone content", async () => {
	// two reports of two comments, of which only the first comment still exists
	stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [OPEN_REPORT_ROW, [...OPEN_REPORT_ROW.slice(0, 2), "c2", ...OPEN_REPORT_ROW.slice(3)]]
		}
		return text.includes('from "note_comments"') ? [["c1"]] : []
	})

	// the first report in full, and the second marked gone
	const openReports = await loadOpenReports()
	expect(openReports).toHaveLength(2)
	expect(openReports[0]).toEqual({
		id: "report-1",
		subjectKind: "noteComment",
		subjectId: "c1",
		subjectText: "you smell",
		subjectPath: "/topics/topic-1/raccoons",
		reason: "rude",
		createdAt: "2026-10-29T10:00:00.000Z",
		author: { id: "user-2", username: "vienna" },
		reporter: { id: "user-1", username: "doubleoevan" },
		canRemove: true,
		isSubjectDeleted: false,
	})
	expect(openReports[1]?.isSubjectDeleted).toBe(true)
})

// Keep writes the resolution and touches no content
test("keeping a report closes it without a delete", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "noteComment", "c1"]] : [],
	)
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-1",
		resolution: "kept",
	})
	expect(isResolved).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(updateQuery?.values).toEqual(expect.arrayContaining(["kept", "admin-1", "report-1"]))
})

// Remove deletes the comment by its note and id with no author clause, then closes the report
test("removing a reported comment deletes it as the admin", async () => {
	// the open report of a comment, and the comment's note
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "reports"')) {
			return [["report-1", "noteComment", "c1"]]
		}
		return text.includes('from "note_comments"') ? [["n1"]] : []
	})

	// the removal
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-1",
		resolution: "removed",
	})
	expect(isResolved).toBe(true)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "note_comments"'))
	expect(deleteQuery?.values).toEqual(["c1", "n1"])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "reports"'))).toBe(true)
})

// a report already resolved, or one that never existed, resolves nothing
test("a missing report is not resolved", async () => {
	stubConnectionPool(() => [])
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-9",
		resolution: "kept",
	})
	expect(isResolved).toBe(false)
})
