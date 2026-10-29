// what a report names, resolved under the same visibility rule that lets the reporter see it
import type { ReportSubjectKind } from "@carlnotes/contracts/reports"
import { toReportText } from "@carlnotes/contracts/reports"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { toHtmlText } from "@carlnotes/contracts/text"
import { db } from "@carlnotes/db"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { noteComments } from "@carlnotes/db/schema/notes"
import { teams } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { decryptChatText } from "../chat/encryption"
import { loadChatRoom } from "../chat/roomAccess"
import { canSeeNote, loadNoteWithPage, loadPageAccess, type NotePage } from "../note/permissions"
import { toTeamRole } from "../team/members"
import { canSeeTopic, gatedTopicColumns } from "../topic/permissions"
import { loadUsername } from "../usernames"

// a report's subject as the reporter could see it: its kind and id, its name for the email's subject line, the page
// that holds it, its text at report time, and its author if it has one
export type ReportedSubject = {
	kind: ReportSubjectKind
	id: string
	label: string
	path: string
	text: string
	authorUserId: string | null
}

// what a report names: its kind and id
type ReportedSubjectRef = { subjectKind: ReportSubjectKind; subjectId: string }

/**
 * Resolves what is being reported, or null if it does not exist or the reporter cannot see it.
 */
export async function toReportedSubject(
	userId: string,
	{ subjectKind, subjectId }: ReportedSubjectRef,
): Promise<ReportedSubject | null> {
	return REPORT_SUBJECT_RESOLVERS[subjectKind](userId, subjectId)
}

// each kind's resolver, under its own read rule
const REPORT_SUBJECT_RESOLVERS: Record<
	ReportSubjectKind,
	(userId: string, subjectId: string) => Promise<ReportedSubject | null>
> = {
	topic: toReportedTopic,
	team: toReportedTeam,
	profile: (_userId, subjectId) => toReportedProfile(subjectId),
	chatMessage: toReportedChatMessage,
	note: toReportedNote,
	noteComment: toReportedNoteComment,
}

// a topic under the same visibility rule the Topic page uses, so anyone who can open a Topic can report it
async function toReportedTopic(userId: string, topicId: string): Promise<ReportedSubject | null> {
	// the topic's gate columns, name, prompt, and owner
	const [topic] = await db
		.select({ ...gatedTopicColumns, name: topics.name, prompt: topics.prompt, ownerId: topics.ownerId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic || !(await canSeeTopic(userId, topic))) {
		return null
	}

	// the topic's name and prompt are the text other people read
	return {
		kind: "topic",
		id: topic.id,
		label: topic.name,
		path: toTopicPath(topic),
		text: toReportText(`${topic.name}\n${topic.prompt}`),
		authorUserId: topic.ownerId,
	}
}

// a team under its visibility rule: members can always report it, anyone can once it is public
async function toReportedTeam(userId: string, teamId: string): Promise<ReportedSubject | null> {
	// the team's name, description, and whether it is public
	const [team] = await db
		.select({ id: teams.id, name: teams.name, description: teams.description, isPublic: teams.isPublic })
		.from(teams)
		.where(eq(teams.id, teamId))
	if (!team || (!team.isPublic && (await toTeamRole(userId, team.id)) === null)) {
		return null
	}

	// the team's name and description are the text other people read, and a team has no one author
	return {
		kind: "team",
		id: team.id,
		label: team.name,
		path: `/teams/${team.id}`,
		text: toReportText([team.name, team.description].filter(Boolean).join("\n")),
		authorUserId: null,
	}
}

// a profile, reported by user id. its owner is its author
async function toReportedProfile(profileUserId: string): Promise<ReportedSubject | null> {
	const username = await loadUsername(profileUserId)
	if (!username) {
		return null
	}
	return {
		kind: "profile",
		id: profileUserId,
		label: username,
		path: `/profiles/${profileUserId}`,
		text: username,
		authorUserId: profileUserId,
	}
}

// a chat room message under its room's membership rule
async function toReportedChatMessage(userId: string, chatMessageId: string): Promise<ReportedSubject | null> {
	// a non-numeric id never matches a row, and the column is a bigint
	const numericChatMessageId = Number(chatMessageId)
	if (!Number.isSafeInteger(numericChatMessageId)) {
		return null
	}
	// the message row names its room
	const [chatMessage] = await db.select().from(chatRoomMessages).where(eq(chatRoomMessages.id, numericChatMessageId))
	if (!chatMessage) {
		return null
	}

	// the room's own gate decides, and the room's page is the topic's or the team's
	const chatRoom = await loadChatRoom(userId, chatMessage.topicId, chatMessage.teamId)
	if (!chatRoom) {
		return null
	}

	// the decrypted text is what the reporter read
	const path = chatRoom.topic ? toTopicPath(chatRoom.topic) : `/teams/${chatMessage.teamId}`
	return {
		kind: "chatMessage",
		id: String(chatMessage.id),
		label: `a message from ${chatMessage.authorUsername}`,
		path,
		text: toReportText(decryptChatText(chatMessage.content) ?? ""),
		authorUserId: chatMessage.authorUserId,
	}
}

// a note under its page's read rule. its text is its name and its body with the markup stripped
async function toReportedNote(userId: string, noteId: string): Promise<ReportedSubject | null> {
	// the note and its page, then the page's read rule
	const noteWithPage = await loadNoteWithPage(noteId)
	if (!noteWithPage) {
		return null
	}
	const pageAccess = await loadPageAccess(userId, noteWithPage.page)
	if (!canSeeNote(userId, noteWithPage.note, pageAccess)) {
		return null
	}

	// the owner is the note's author
	return {
		kind: "note",
		id: noteWithPage.note.id,
		label: noteWithPage.note.name,
		path: toNotePagePath(noteWithPage.page),
		text: toReportText(`${noteWithPage.note.name}\n${toHtmlText(noteWithPage.note.html)}`),
		authorUserId: noteWithPage.note.ownerUserId,
	}
}

// a note comment under its note's read rule
async function toReportedNoteComment(userId: string, noteCommentId: string): Promise<ReportedSubject | null> {
	// the comment, then its note and page
	const [noteComment] = await db.select().from(noteComments).where(eq(noteComments.id, noteCommentId))
	if (!noteComment) {
		return null
	}
	const noteWithPage = await loadNoteWithPage(noteComment.noteId)
	if (!noteWithPage) {
		return null
	}

	// the note's read rule decides
	const pageAccess = await loadPageAccess(userId, noteWithPage.page)
	if (!canSeeNote(userId, noteWithPage.note, pageAccess)) {
		return null
	}

	// the comment's body is the text, and its author is whoever wrote it
	return {
		kind: "noteComment",
		id: noteComment.id,
		label: `a comment on ${noteWithPage.note.name}`,
		path: toNotePagePath(noteWithPage.page),
		text: toReportText(noteComment.body),
		authorUserId: noteComment.authorUserId,
	}
}

// the page a note lives on: its topic's page or its team's page
function toNotePagePath(page: NotePage): string {
	return page.kind === "topic" ? toTopicPath(page.topic) : `/teams/${page.team.id}`
}
