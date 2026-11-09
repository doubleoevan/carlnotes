// admin report tests: the open list shapes each report with its people and whether its content is gone, Keep closes a
// report without touching the content, and Remove deletes a comment through the comment delete before closing
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import type { Context } from "hono"
import { loadOpenReports, resolveReport } from "./adminReports"
import { toReportTextHash } from "./reports"

// put the connection pool and the auth secret back after each test
const restoreAuthSecret = saveEnvSettings(["BETTER_AUTH_SECRET"])
afterEach(() => {
	restoreConnectionPool()
	restoreAuthSecret()
})

// one open report row as the list's read selects it: the report, then the reporter, the author, and when an admin
// blocked the author
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
	null,
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
		subjectImage: null,
		reason: "rude",
		createdAt: "2026-10-29T10:00:00.000Z",
		author: { id: "user-2", username: "vienna" },
		reporter: { id: "user-1", username: "doubleoevan" },
		canRemove: true,
		isSubjectDeleted: false,
		canAdminBlock: true,
	})
	expect(openReports[1]?.isSubjectDeleted).toBe(true)
})

// Clear writes the resolution and touches no content
test("keeping a report closes it without a delete", async () => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "noteComment", "c1", null, "the cleared text"]] : [],
	)
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-1",
		resolution: "cleared",
	})
	expect(isResolved).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(updateQuery?.values).toEqual(
		expect.arrayContaining(["cleared", "admin-1", "report-1", toReportTextHash("the cleared text")]),
	)
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

// Remove deletes a reported comment for everyone
test.each([["comment", "comments"]] as const)("removing a reported %s deletes it", async (subjectKind, table) => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", subjectKind, "subject-1", "author-1"]] : [],
	)
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-1",
		resolution: "removed",
	})
	expect(isResolved).toBe(true)

	// the subject is deleted by its id, and its author is not under an admin block
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith(`delete from "${table}"`))
	expect(deleteQuery?.values).toEqual(["subject-1"])
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "users"'))).toBe(false)
})

// Block sets the admin block on the author, deletes a removable subject, and closes the report as blocked
test("blocking from a report blocks the author, deletes the comment, and closes the report", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "comment", "comment-1", "author-1"]] : [],
	)
	await resolveReport({ context: {} as Context, adminUserId: "admin-1", reportId: "report-1", resolution: "blocked" })

	// the author's row takes the admin block and the admin who set it
	const blockQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(blockQuery?.values).toContain("admin-1")
	expect(blockQuery?.values).toContain("author-1")
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('delete from "comments"'))).toBe(true)
	const closeQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(closeQuery?.values).toContain("blocked")
})

// Block on a Finding puts an admin block on the Topic's owner and deletes nothing
test("blocking from a report of a Finding deletes nothing", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "reports"') ? [["report-1", "finding", "finding-1", "owner-1"]] : [],
	)
	await resolveReport({ context: {} as Context, adminUserId: "admin-1", reportId: "report-1", resolution: "blocked" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('update "users"'))).toBe(true)
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith("delete"))).toBe(false)
})

// a report already resolved, or one that never existed, resolves nothing
test("a missing report is not resolved", async () => {
	stubConnectionPool(() => [])
	const isResolved = await resolveReport({
		context: {} as Context,
		adminUserId: "admin-1",
		reportId: "report-9",
		resolution: "cleared",
	})
	expect(isResolved).toBe(false)
})
