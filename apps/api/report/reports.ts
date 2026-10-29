// the stored reports: writing one, and the filters that hide a reported subject from its reporter
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { db } from "@carlnotes/db"
import { reports } from "@carlnotes/db/schema/reports"
import { and, eq, inArray, isNull, notExists, or, type SQL, type SQLWrapper, sql } from "drizzle-orm"
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

// the reports that hide their subject from the reporter: the open ones and the kept ones
const OPEN_OR_KEPT_REPORT_FILTER = or(isNull(reports.resolvedAt), eq(reports.resolution, "kept")) as SQL

/**
 * Returns the filter that keeps a user's reported subjects out of a read, by the column that holds the subject id.
 */
export function toUnreportedFilter(userId: string, subjectKind: ReportSubjectKind, subjectIdColumn: SQLWrapper): SQL {
	// a message id is a bigint, so the stored text id is compared against the column as text
	return notExists(
		db
			.select({ id: reports.id })
			.from(reports)
			.where(
				and(
					eq(reports.reporterUserId, userId),
					eq(reports.subjectKind, subjectKind),
					eq(reports.subjectId, sql`${subjectIdColumn}::text`),
					OPEN_OR_KEPT_REPORT_FILTER,
				),
			),
	)
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
