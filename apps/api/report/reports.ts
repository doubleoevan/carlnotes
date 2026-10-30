// the stored reports: writing one, and loading which subjects a user reported
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { db } from "@carlnotes/db"
import { OPEN_OR_KEPT_REPORT_FILTER } from "@carlnotes/db/contentFilters"
import { reports } from "@carlnotes/db/schema/reports"
import { and, eq, inArray } from "drizzle-orm"
import type { ReportedSubject } from "./reportSubjects"

// what writing a report needs: the reporter, the subject as resolved, and the reporter's reason
type SaveReportOptions = { reporterUserId: string; subject: ReportedSubject; reason: string }

/**
 * Stores a report and returns its id, or null if the reporter already reported the subject.
 */
export async function saveReport({ reporterUserId, subject, reason }: SaveReportOptions): Promise<string | null> {
	// the unique index on reporter and subject makes a second report of the same thing a no-op
	const [insertedReport] = await db
		.insert(reports)
		.values({
			subjectKind: subject.kind,
			subjectId: subject.id,
			subjectAuthorUserId: subject.authorUserId,
			reporterUserId,
			reason,
			subjectText: subject.text,
			subjectPath: subject.path,
		})
		.onConflictDoNothing()
		.returning({ id: reports.id })

	// no row back means the reporter already reported this subject
	return insertedReport?.id ?? null
}

/**
 * Loads which of some subjects a user has reported, for a read that filters rows after loading them.
 */
export async function loadReportedSubjectIds(
	userId: string,
	subjectKind: ReportSubjectKind,
	subjectIds: string[],
): Promise<Set<string>> {
	if (subjectIds.length === 0) {
		return new Set()
	}

	// the user's hiding reports among the subjects asked about
	const reportRows = await db
		.select({ subjectId: reports.subjectId })
		.from(reports)
		.where(
			and(
				eq(reports.reporterUserId, userId),
				eq(reports.subjectKind, subjectKind),
				inArray(reports.subjectId, subjectIds),
				OPEN_OR_KEPT_REPORT_FILTER,
			),
		)
	return new Set(reportRows.map((reportRow) => reportRow.subjectId))
}
