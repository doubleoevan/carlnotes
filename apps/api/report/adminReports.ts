// the admin console's reports: the open list, and resolving one by removing its content or keeping it
import {
	type AdminReport,
	REMOVABLE_REPORT_SUBJECT_KINDS,
	type ReportResolution,
	type ReportSubjectKind,
} from "@carlnotes/contracts/reports"
import { db } from "@carlnotes/db"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { noteComments, notes } from "@carlnotes/db/schema/notes"
import { reports } from "@carlnotes/db/schema/reports"
import { users } from "@carlnotes/db/schema/users"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { Context } from "hono"
import { deleteChatRoomMessage } from "../chat/roomDeletes"
import { deleteNoteComment } from "../note/noteComments"

// the reporter and the author, each joined to the report from the users table
const reporters = alias(users, "reporters")
const authors = alias(users, "authors")

/**
 * Loads the open reports newest first, each with whether its subject is already deleted.
 */
export async function loadOpenReports(): Promise<AdminReport[]> {
	// the open rows with both people's usernames
	const reportRows = await db
		.select({
			id: reports.id,
			subjectKind: reports.subjectKind,
			subjectId: reports.subjectId,
			subjectText: reports.subjectText,
			subjectPath: reports.subjectPath,
			reason: reports.reason,
			createdAt: reports.createdAt,
			// the two people
			reporterId: reporters.id,
			reporterUsername: reporters.username,
			authorId: authors.id,
			authorUsername: authors.username,
		})
		.from(reports)
		.innerJoin(reporters, eq(reporters.id, reports.reporterUserId))
		.leftJoin(authors, eq(authors.id, reports.subjectAuthorUserId))
		.where(isNull(reports.resolvedAt))
		.orderBy(desc(reports.createdAt))

	// which removable subjects still exist, read per kind in one query each
	const existingSubjectKeys = await loadExistingSubjectKeys(reportRows)
	return reportRows.map((reportRow) => ({
		id: reportRow.id,
		subjectKind: reportRow.subjectKind,
		subjectId: reportRow.subjectId,
		subjectText: reportRow.subjectText,
		subjectPath: reportRow.subjectPath,
		reason: reportRow.reason,
		createdAt: reportRow.createdAt.toISOString(),
		author:
			reportRow.authorId && reportRow.authorUsername
				? { id: reportRow.authorId, username: reportRow.authorUsername }
				: null,
		reporter: { id: reportRow.reporterId, username: reportRow.reporterUsername },
		canRemove: REMOVABLE_REPORT_SUBJECT_KINDS.has(reportRow.subjectKind),
		isSubjectDeleted:
			REMOVABLE_REPORT_SUBJECT_KINDS.has(reportRow.subjectKind) &&
			!existingSubjectKeys.has(`${reportRow.subjectKind}:${reportRow.subjectId}`),
	}))
}

// the subjects among some reports that still exist, as kind:id keys, for the removable kinds
async function loadExistingSubjectKeys(
	reportRows: { subjectKind: ReportSubjectKind; subjectId: string }[],
): Promise<Set<string>> {
	// the ids of each removable kind, a message id as the bigint it is
	const toSubjectIdsOfKind = (subjectKind: ReportSubjectKind): string[] =>
		reportRows.filter((reportRow) => reportRow.subjectKind === subjectKind).map((reportRow) => reportRow.subjectId)
	const chatMessageIds = toSubjectIdsOfKind("chatMessage")
		.map((subjectId) => Number(subjectId))
		.filter((subjectId) => Number.isSafeInteger(subjectId))
	const noteIds = toSubjectIdsOfKind("note")
	const noteCommentIds = toSubjectIdsOfKind("noteComment")

	// one read per kind that has any
	const [chatMessageRows, noteRows, noteCommentRows] = await Promise.all([
		chatMessageIds.length
			? db
					.select({ id: chatRoomMessages.id })
					.from(chatRoomMessages)
					.where(inArray(chatRoomMessages.id, chatMessageIds))
			: [],
		noteIds.length ? db.select({ id: notes.id }).from(notes).where(inArray(notes.id, noteIds)) : [],
		noteCommentIds.length
			? db.select({ id: noteComments.id }).from(noteComments).where(inArray(noteComments.id, noteCommentIds))
			: [],
	])
	return new Set([
		...chatMessageRows.map((chatMessageRow) => `chatMessage:${chatMessageRow.id}`),
		...noteRows.map((noteRow) => `note:${noteRow.id}`),
		...noteCommentRows.map((noteCommentRow) => `noteComment:${noteCommentRow.id}`),
	])
}

// what resolving needs: the admin's request context and id, the report, and the resolution
type ResolveReportOptions = {
	context: Context
	adminUserId: string
	reportId: string
	resolution: ReportResolution
}

/**
 * Resolves an open report: Remove deletes the content through its own delete path, Keep leaves it. Returns whether
 * an open report with that id existed.
 */
export async function resolveReport({
	context,
	adminUserId,
	reportId,
	resolution,
}: ResolveReportOptions): Promise<boolean> {
	// the open report, or nothing to resolve
	const [report] = await db
		.select({ id: reports.id, subjectKind: reports.subjectKind, subjectId: reports.subjectId })
		.from(reports)
		.where(and(eq(reports.id, reportId), isNull(reports.resolvedAt)))
	if (!report) {
		return false
	}

	// remove the content first, through the path its author or a leader would use. content already gone is fine
	if (resolution === "removed" && REMOVABLE_REPORT_SUBJECT_KINDS.has(report.subjectKind)) {
		await removeReportedSubject({ context, adminUserId, subjectKind: report.subjectKind, subjectId: report.subjectId })
	}

	// close the report, and drop its copy of the text with it
	await db
		.update(reports)
		.set({ resolution, resolvedAt: new Date(), resolvedByUserId: adminUserId, subjectText: "" })
		.where(eq(reports.id, report.id))
	return true
}

// what removing needs: the admin's request context and id, and the subject
type RemoveReportedSubjectOptions = {
	context: Context
	adminUserId: string
	subjectKind: ReportSubjectKind
	subjectId: string
}

// delete a reported message, note, or comment as the admin
async function removeReportedSubject({
	context,
	adminUserId,
	subjectKind,
	subjectId,
}: RemoveReportedSubjectOptions): Promise<void> {
	if (subjectKind === "chatMessage") {
		// the room's own delete takes the message's files and mentions with it. the admin branch of its gate allows it
		const numericChatMessageId = Number(subjectId)
		const [chatRoomMessage] = Number.isSafeInteger(numericChatMessageId)
			? await db.select().from(chatRoomMessages).where(eq(chatRoomMessages.id, numericChatMessageId))
			: []
		// a message already gone leaves nothing to delete
		if (chatRoomMessage) {
			await deleteChatRoomMessage(context, adminUserId, chatRoomMessage)
		}
		return
	}
	// the note delete takes its comments and reads with it
	if (subjectKind === "note") {
		await db.delete(notes).where(eq(notes.id, subjectId))
		return
	}

	// the comment's note id comes from the row, and the admin branch deletes anyone's comment
	if (subjectKind === "noteComment") {
		const [noteComment] = await db
			.select({ noteId: noteComments.noteId })
			.from(noteComments)
			.where(eq(noteComments.id, subjectId))
		// a comment already gone leaves nothing to delete
		if (noteComment) {
			await deleteNoteComment({ noteCommentId: subjectId, noteId: noteComment.noteId, authorUserId: null })
		}
	}
}
