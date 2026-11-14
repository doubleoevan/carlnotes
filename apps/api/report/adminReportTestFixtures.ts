// what the admin report tests share: the restore each test file runs after a test, one open report row, a reported
// user's avatar keys, and the resolve of a report with the check that it closed
import { expect, mock } from "bun:test"
import type { ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import type { ReportResolution } from "@carlnotes/contracts/reports"
import { restoreConnectionPool, type SentQuery } from "@carlnotes/db/connectionPoolStub"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import type { Context } from "hono"
import { resolveReport } from "./adminReports"

// put the connection pool, the auth secret, and every spy back
const restoreAuthSecret = saveEnvSettings(["BETTER_AUTH_SECRET"])
export function restoreAdminReportTest(): void {
	restoreConnectionPool()
	restoreAuthSecret()
	mock.restore()
}

// one open report row as the list's read selects it: the report, then the reporter, the author, and when an admin
// blocked the author
export const OPEN_REPORT_ROW = [
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

// a reported user's published upload and their unchecked avatar, and a provider photo's url
export const PUBLISHED_AVATAR_KEY = "avatars/user-2/published.png"
export const UNCHECKED_AVATAR_KEY = "avatars/user-2/unchecked.png"
export const PROVIDER_PHOTO_URL = "https://lh3.googleusercontent.com/a/photo"

// an open report row of a kind and a subject, with the other columns of OPEN_REPORT_ROW
export function toOpenReportRow({ subjectKind, subjectId }: ReportedSubjectQuery): unknown[] {
	return [`report-${subjectId}`, subjectKind, subjectId, ...OPEN_REPORT_ROW.slice(3)]
}

// resolve report-1 as admin-1
export function resolveOpenReport(resolution: ReportResolution): Promise<boolean> {
	return resolveReport({ context: {} as Context, adminUserId: "admin-1", reportId: "report-1", resolution })
}

// expect the update that closes the report to write the resolution
export function expectReportClosed(sentQueries: SentQuery[], resolution: ReportResolution): void {
	const closeQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "reports"'))
	expect(closeQuery?.values).toContain(resolution)
}
