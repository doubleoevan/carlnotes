// the unread note badge counts. what changed in a note since a user last opened it, and the read that clears it
import type { NoteBadge } from "@shared/contracts"
import { and, count, eq, gt, inArray, isNull, ne, or } from "drizzle-orm"
import { db } from "../../db"
import {
	noteComments,
	noteCommentThreads,
	noteReads,
	notes,
	teamMembers,
	teams,
	teamTopics,
	topics,
} from "../../db/schema"

/**
 * Every unread edit and comment count the signed-in user has. One entry per note that holds something.
 */
export async function loadNoteBadges(userId: string | null): Promise<NoteBadge[]> {
	if (!userId) {
		return []
	}

	// the pages a badge can name, and the teams holding each of those topics
	const { topicIds, teamIds, teamIdsByTopicId } = await loadBadgedPages(userId)
	if (topicIds.length === 0 && teamIds.length === 0) {
		return []
	}

	// every note on those pages the user may see, with their own read time beside it.
	// a private note is its owner's alone, so it never reaches anybody else's badge
	const pageFilter = or(
		topicIds.length > 0 ? inArray(notes.topicId, topicIds) : undefined,
		inArray(notes.teamId, teamIds),
	)
	const viewableNotes = await db
		.select({
			id: notes.id,
			name: notes.name,
			topicId: notes.topicId,
			teamId: notes.teamId,
			topicName: topics.name,
			teamName: teams.name,
			bodyEditedAt: notes.bodyEditedAt,
			lastEditorUserId: notes.lastEditorUserId,
			readAt: noteReads.readAt,
		})
		.from(notes)
		.leftJoin(noteReads, and(eq(noteReads.noteId, notes.id), eq(noteReads.userId, userId)))
		.leftJoin(topics, eq(topics.id, notes.topicId))
		.leftJoin(teams, eq(teams.id, notes.teamId))
		.where(and(pageFilter, or(ne(notes.visibility, "private"), eq(notes.ownerUserId, userId))))

	// the comments each note received since this user last read it
	const unreadCommentsByNoteId = await loadUnreadCommentCounts(
		userId,
		viewableNotes.map((viewableNote) => viewableNote.id),
	)

	// a note with no updates is filtered out
	const noteBadges: NoteBadge[] = []
	for (const viewableNote of viewableNotes) {
		const unreadEdits = toUnreadEdits(userId, viewableNote)
		const unreadComments = unreadCommentsByNoteId.get(viewableNote.id) ?? 0
		if (unreadEdits === 0 && unreadComments === 0) {
			continue
		}
		noteBadges.push({
			noteId: viewableNote.id,
			topicId: viewableNote.topicId,
			teamId: viewableNote.teamId,
			teamIds: toPageTeamIds(viewableNote, teamIdsByTopicId),
			noteName: viewableNote.name,
			pageName: viewableNote.topicName ?? viewableNote.teamName ?? "",
			unreadEdits,
			unreadComments,
		})
	}
	return noteBadges
}

/**
 * Save a note as read by a user, which takes both of its counts to zero.
 */
export async function saveNoteRead(userId: string, noteId: string): Promise<void> {
	// the save moves forward on every open
	await db
		.insert(noteReads)
		.values({ noteId, userId })
		.onConflictDoUpdate({ target: [noteReads.noteId, noteReads.userId], set: { readAt: new Date() } })
}

/**
 * Whether the body changed since the user last read it, counted once per note however many edits it took.
 */
export function toUnreadEdits(
	userId: string,
	note: { bodyEditedAt: Date | null; lastEditorUserId: string | null; readAt: Date | null },
): number {
	// a note nobody has edited yet has nothing to view
	if (!note.bodyEditedAt) {
		return 0
	}

	// a user is never badged for their own edits
	if (note.lastEditorUserId === userId) {
		return 0
	}

	// counts when the note was never opened, or when the edit came after the last save
	return !note.readAt || note.bodyEditedAt > note.readAt ? 1 : 0
}

// the teams a note's page belongs to. a team note has its own, a topic note has every team holding the topic
function toPageTeamIds(
	note: { topicId: string | null; teamId: string | null },
	teamIdsByTopicId: Map<string, string[]>,
): string[] {
	if (note.topicId) {
		return teamIdsByTopicId.get(note.topicId) ?? []
	}
	return note.teamId ? [note.teamId] : []
}

// the pages whose notes a user is badged for: their teams, and the topics those teams own or hold
async function loadBadgedPages(
	userId: string,
): Promise<{ topicIds: string[]; teamIds: string[]; teamIdsByTopicId: Map<string, string[]> }> {
	// the teams the user is an active member of
	const memberRows = await db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
	const teamIds = memberRows.map((memberRow) => memberRow.teamId)
	if (teamIds.length === 0) {
		return { topicIds: [], teamIds: [], teamIdsByTopicId: new Map() }
	}

	// the topics those teams own, plus the ones shared with them
	const ownedTopicRows = await db
		.select({ topicId: topics.id, teamId: topics.teamId })
		.from(topics)
		.where(inArray(topics.teamId, teamIds))
	const sharedTopicRows = await db
		.select({ topicId: teamTopics.topicId, teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, teamIds))

	// one topic can be on several teams, so every team holding it is collected under it
	const teamIdsByTopicId = new Map<string, string[]>()
	for (const topicRow of [...ownedTopicRows, ...sharedTopicRows]) {
		const topicTeamIds = teamIdsByTopicId.get(topicRow.topicId) ?? []
		if (topicRow.teamId && !topicTeamIds.includes(topicRow.teamId)) {
			teamIdsByTopicId.set(topicRow.topicId, [...topicTeamIds, topicRow.teamId])
		}
	}
	return { topicIds: [...teamIdsByTopicId.keys()], teamIds, teamIdsByTopicId }
}

// how many comments each note received since the user last read it, their own and the deleted ones left out
async function loadUnreadCommentCounts(userId: string, noteIds: string[]): Promise<Map<string, number>> {
	if (noteIds.length === 0) {
		return new Map()
	}

	// count each note's comments from somebody else after the read time. a closed account leaves a null author
	const commentRows = await db
		.select({ noteId: noteCommentThreads.noteId, unread: count() })
		.from(noteComments)
		.innerJoin(noteCommentThreads, eq(noteComments.threadId, noteCommentThreads.id))
		.leftJoin(noteReads, and(eq(noteReads.noteId, noteCommentThreads.noteId), eq(noteReads.userId, userId)))
		.where(
			and(
				inArray(noteCommentThreads.noteId, noteIds),
				isNull(noteComments.deletedAt),
				or(isNull(noteComments.authorUserId), ne(noteComments.authorUserId, userId)),
				or(isNull(noteReads.readAt), gt(noteComments.createdAt, noteReads.readAt)),
			),
		)
		.groupBy(noteCommentThreads.noteId)
	return new Map(commentRows.map((commentRow) => [commentRow.noteId, commentRow.unread]))
}

// a comment mark wraps its text in a span of its own, which changes the body's HTML without changing what the body says
const COMMENT_MARK_PATTERN = /<span\b[^>]*\bdata-bn-thread-id="[^"]*"[^>]*>([\s\S]*?)<\/span>/g

/**
 * Whether two HTML bodies differ in what they say, with comment marks unwrapped first.
 */
export function isNoteBodyChanged(storedHtml: string, freshHtml: string): boolean {
	return toCommentlessHtml(storedHtml) !== toCommentlessHtml(freshHtml)
}

// every comment mark replaced, keeping the words it was attached to. the loop reaches nested comment marks
function toCommentlessHtml(html: string): string {
	let commentlessHtml = html
	let previousHtml = ""

	// each pass unwraps one layer, so a mark inside a mark takes two
	while (commentlessHtml !== previousHtml) {
		previousHtml = commentlessHtml
		commentlessHtml = commentlessHtml.replace(COMMENT_MARK_PATTERN, "$1")
	}
	return commentlessHtml
}
