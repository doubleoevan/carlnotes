// the admin console's reports: the open list, and resolving one by removing its content, clearing it, or putting an
// admin block on its author
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
import { comments } from "@carlnotes/db/schema/social"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { loadTopicImageUrlsByTopic } from "@carlnotes/db/topicImages"
import { topicImageModel } from "@carlnotes/models/topicImageModel"
import { removeTopicImageUpload, startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import type { Context } from "hono"
import { setAdminBlock } from "../adminBlocks"
import { deleteChatRoomMessage } from "../chat/roomDeletes"
import { deleteNoteComment } from "../note/noteComments"
import { toReportTextHash } from "./reports"

// the reporter and the author, each joined to the report from the users table
const reporters = alias(users, "reporters")
const authors = alias(users, "authors")

/**
 * Counts the open reports.
 */
export async function countOpenReports(): Promise<number> {
	return db.$count(reports, isNull(reports.resolvedAt))
}

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
			authorAdminBlockedAt: authors.adminBlockedAt,
		})
		.from(reports)
		.innerJoin(reporters, eq(reporters.id, reports.reporterUserId))
		.leftJoin(authors, eq(authors.id, reports.subjectAuthorUserId))
		.where(isNull(reports.resolvedAt))
		.orderBy(desc(reports.createdAt))

	// which removable subjects still exist, read per kind in one query each, and the reported topic images as they stand
	const [existingSubjectKeys, topicImageUrlsByTopic] = await Promise.all([
		loadExistingSubjectKeys(reportRows),
		loadTopicImageUrlsByTopic(toSubjectIdsOfKind(reportRows, "topicImage")),
	])
	return reportRows.map((reportRow) => ({
		id: reportRow.id,
		subjectKind: reportRow.subjectKind,
		subjectId: reportRow.subjectId,
		subjectText: reportRow.subjectText,
		subjectPath: reportRow.subjectPath,
		subjectImage:
			reportRow.subjectKind === "topicImage" ? (topicImageUrlsByTopic.get(reportRow.subjectId) ?? null) : null,
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
		// an author who is not yet under an admin block can be blocked from the report
		canAdminBlock: Boolean(reportRow.authorId) && reportRow.authorAdminBlockedAt === null,
	}))
}

// the subject ids of one kind among some reports
function toSubjectIdsOfKind(
	reportRows: { subjectKind: ReportSubjectKind; subjectId: string }[],
	subjectKind: ReportSubjectKind,
): string[] {
	return reportRows.filter((reportRow) => reportRow.subjectKind === subjectKind).map((reportRow) => reportRow.subjectId)
}

// the subjects among some reports that still exist, as kind:id keys, for the removable kinds. a topic image exists
// while its topic does
async function loadExistingSubjectKeys(
	reportRows: { subjectKind: ReportSubjectKind; subjectId: string }[],
): Promise<Set<string>> {
	// the ids of each removable kind, a message id as the bigint it is
	const chatMessageIds = toSubjectIdsOfKind(reportRows, "chatMessage")
		.map((subjectId) => Number(subjectId))
		.filter((subjectId) => Number.isSafeInteger(subjectId))

	// the notes, the note comments, and the Comments, by their text ids
	const noteIds = toSubjectIdsOfKind(reportRows, "note")
	const noteCommentIds = toSubjectIdsOfKind(reportRows, "noteComment")
	const commentIds = toSubjectIdsOfKind(reportRows, "comment")
	const topicImageTopicIds = toSubjectIdsOfKind(reportRows, "topicImage")

	// one read per kind that has any
	const [chatMessageRows, noteRows, noteCommentRows, commentRows, topicRows] = await Promise.all([
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
		commentIds.length ? db.select({ id: comments.id }).from(comments).where(inArray(comments.id, commentIds)) : [],
		topicImageTopicIds.length
			? db.select({ id: topics.id }).from(topics).where(inArray(topics.id, topicImageTopicIds))
			: [],
	])
	return new Set([
		...chatMessageRows.map((chatMessageRow) => `chatMessage:${chatMessageRow.id}`),
		...noteRows.map((noteRow) => `note:${noteRow.id}`),
		...noteCommentRows.map((noteCommentRow) => `noteComment:${noteCommentRow.id}`),
		...commentRows.map((commentRow) => `comment:${commentRow.id}`),
		...topicRows.map((topicRow) => `topicImage:${topicRow.id}`),
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
 * Resolves an open report: Remove deletes the content through its own delete path, Clear leaves it, and Block also
 * sets an admin block on its author. Returns whether an open report with that id existed.
 */
export async function resolveReport({
	context,
	adminUserId,
	reportId,
	resolution,
}: ResolveReportOptions): Promise<boolean> {
	// the open report, or nothing to resolve
	const [report] = await db
		.select({
			id: reports.id,
			subjectKind: reports.subjectKind,
			subjectId: reports.subjectId,
			subjectAuthorUserId: reports.subjectAuthorUserId,
			subjectText: reports.subjectText,
		})
		.from(reports)
		.where(and(eq(reports.id, reportId), isNull(reports.resolvedAt)))
	if (!report) {
		return false
	}

	// Block puts the author under an admin block, which hides their reactions and comments everywhere
	if (resolution === "blocked" && report.subjectAuthorUserId) {
		await setAdminBlock(report.subjectAuthorUserId, adminUserId)
	}

	// Remove and Block delete the content first, through the path its author or a leader would use. content already
	// gone is fine
	if (resolution !== "cleared" && REMOVABLE_REPORT_SUBJECT_KINDS.has(report.subjectKind)) {
		await removeReportedSubject({ context, adminUserId, subjectKind: report.subjectKind, subjectId: report.subjectId })
	}

	// close the report and drop its copy of the text. Clear keeps a hash, so a later report can tell the text changed
	await db
		.update(reports)
		.set({
			resolution,
			resolvedAt: new Date(),
			resolvedByUserId: adminUserId,
			subjectText: "",
			clearedTextHash: resolution === "cleared" ? toReportTextHash(report.subjectText) : null,
		})
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

// delete a reported message, note, note comment, or comment as the admin, or render a reported topic image again
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
		return
	}

	// a comment is deleted for everyone, as its Topic's owner would delete it
	if (subjectKind === "comment") {
		await db.delete(comments).where(eq(comments.id, subjectId))
		return
	}

	// remove an upload, then draw the topic's image again on the platform's budget. skip a topic that is gone
	if (subjectKind === "topicImage") {
		const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, subjectId))
		if (topic) {
			await removeTopicImageUpload(subjectId)
			await startTopicImageRender({ topicId: subjectId, userId: null, kind: "admin", model: topicImageModel() })
		}
	}
}
