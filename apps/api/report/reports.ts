// the stored reports: writing one, and loading which subjects a user reported
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { db } from "@carlnotes/db"
import { OPEN_OR_CLEARED_REPORT_FILTER } from "@carlnotes/db/contentFilters"
import { reports } from "@carlnotes/db/schema/reports"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { and, eq, inArray, isNotNull, isNull, ne, type SQL } from "drizzle-orm"
import type { ReportedSubject } from "./reportSubjects"

// what writing a report needs: the reporter, the subject as resolved, and the reporter's reason
type SaveReportOptions = { reporterUserId: string; subject: ReportedSubject; reason: string }

// the report one user holds of one subject
function toOwnReportFilter(reporterUserId: string, subjectKind: ReportSubjectKind, subjectId: string): SQL {
	return and(
		eq(reports.reporterUserId, reporterUserId),
		eq(reports.subjectKind, subjectKind),
		eq(reports.subjectId, subjectId),
	) as SQL
}

/**
 * Returns the keyed hash of a report's text. It tells whether text changed without keeping private text readable.
 */
export function toReportTextHash(subjectText: string): string {
	return toAuthSecretSignature({ value: subjectText, purpose: "a report's text", encoding: "hex" })
}

/**
 * Stores a report and returns its id, or null if nothing new reached the admins. A cleared report whose text changed
 * reopens with the new text. Any other repeat only restores a report the reporter removed.
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

	if (insertedReport) {
		return insertedReport.id
	}

	// the reporter already reported this subject, so changed text reopens what an admin cleared
	const ownReportFilter = toOwnReportFilter(reporterUserId, subject.kind, subject.id)
	const [reopenedReport] = await db
		.update(reports)
		.set({
			reason,
			subjectText: subject.text,
			subjectPath: subject.path,
			resolution: null,
			resolvedAt: null,
			resolvedByUserId: null,
			clearedTextHash: null,
			withdrawnAt: null,
			remindedAt: null,
			createdAt: new Date(),
		})
		.where(
			and(
				ownReportFilter,
				eq(reports.resolution, "cleared"),
				ne(reports.clearedTextHash, toReportTextHash(subject.text)),
			),
		)
		.returning({ id: reports.id })
	if (reopenedReport) {
		return reopenedReport.id
	}

	// unchanged text stays resolved, and a removed report counts as the user's again
	await db
		.update(reports)
		.set({ withdrawnAt: null })
		.where(and(ownReportFilter, isNotNull(reports.withdrawnAt)))
	return null
}

/**
 * Removes a user's report of a subject. An open report leaves the admin queue, and a resolved one keeps its resolution.
 */
export async function removeReport(
	reporterUserId: string,
	subjectKind: ReportSubjectKind,
	subjectId: string,
): Promise<void> {
	// an open report is deleted, and a resolved one is marked so a repeat of the same text stays closed
	const ownReportFilter = toOwnReportFilter(reporterUserId, subjectKind, subjectId)
	await db.delete(reports).where(and(ownReportFilter, isNull(reports.resolvedAt)))
	await db.update(reports).set({ withdrawnAt: new Date() }).where(ownReportFilter)
}

/**
 * Returns whether a user holds a report of a subject, however an admin resolved it.
 */
export async function hasReportedSubject(
	userId: string,
	subjectKind: ReportSubjectKind,
	subjectId: string,
): Promise<boolean> {
	const [reportRow] = await db
		.select({ id: reports.id })
		.from(reports)
		.where(and(toOwnReportFilter(userId, subjectKind, subjectId), isNull(reports.withdrawnAt)))
		.limit(1)
	return Boolean(reportRow)
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
				OPEN_OR_CLEARED_REPORT_FILTER,
			),
		)
	return new Set(reportRows.map((reportRow) => reportRow.subjectId))
}
