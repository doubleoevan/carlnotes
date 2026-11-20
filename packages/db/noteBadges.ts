// the unread note badge counts. what changed in a note since a user last opened it, and the read that clears it
import type { NoteBadge } from "@carlnotes/contracts/notes"
import { and, count, eq, gt, inArray, isNotNull, isNull, ne, or, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { union } from "drizzle-orm/pg-core"
import { toNotUserBlockedAuthorFilter } from "./contentFilters"
import { db } from "./index"
import { noteComments, noteReads, notes } from "./schema/notes"
import { teamMembers, teams } from "./schema/teams"
import { teamTopics } from "./schema/teamTopics"
import { topics } from "./schema/topics"

/**
 * Every unread edit and comment count the signed-in user has. One entry per note that holds something.
 */
export async function loadNoteBadges(userId: string | null): Promise<NoteBadge[]> {
	return userId ? loadPageNoteBadges(userId, await loadBadgedPages(userId)) : []
}

// the note badges on a user's pages
async function loadPageNoteBadges(
	userId: string,
	{ topicIds, teamIds, teamIdsByTopicId }: BadgedPages,
): Promise<NoteBadge[]> {
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

/**
 * Loads how many unread note edits and comments each given user has, summed across every note they may see, in one
 * grouped read. A user with none is left out.
 */
export async function loadNoteCounts(userIds: string[]): Promise<Map<string, number>> {
	// each user's active teams
	const memberTeams = db.$with("member_teams").as(
		db
			.select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(and(inArray(teamMembers.userId, userIds), eq(teamMembers.isActive, true))),
	)

	// a note the user may see, with what its edit count reads. a private note is its owner's alone
	const viewableNoteColumns = {
		userId: memberTeams.userId,
		noteId: notes.id,
		bodyEditedAt: notes.bodyEditedAt,
		lastEditorUserId: notes.lastEditorUserId,
	}
	const isViewable = or(ne(notes.visibility, "private"), eq(notes.ownerUserId, memberTeams.userId))

	// the notes on each user's pages, each once however many of the user's teams hold its page: the teams' own notes,
	// and the notes of the topics that those teams own or hold a share of
	const viewableNotes = db
		.$with("viewable_notes")
		.as(
			union(
				db
					.select(viewableNoteColumns)
					.from(memberTeams)
					.innerJoin(notes, eq(notes.teamId, memberTeams.teamId))
					.where(isViewable),
				db
					.select(viewableNoteColumns)
					.from(memberTeams)
					.innerJoin(topics, eq(topics.teamId, memberTeams.teamId))
					.innerJoin(notes, eq(notes.topicId, topics.id))
					.where(isViewable),
				db
					.select(viewableNoteColumns)
					.from(memberTeams)
					.innerJoin(teamTopics, eq(teamTopics.teamId, memberTeams.teamId))
					.innerJoin(notes, eq(notes.topicId, teamTopics.topicId))
					.where(isViewable),
			),
		)

	// the comments a note received from somebody else since the user last read it, a blocked person's left out. a
	// closed account leaves a null author
	const unreadCommentCountQuery = db
		.select({ unreadCommentCount: count() })
		.from(noteComments)
		.where(
			and(
				eq(noteComments.noteId, viewableNotes.noteId),
				or(isNull(noteComments.authorUserId), ne(noteComments.authorUserId, viewableNotes.userId)),
				toNotUserBlockedAuthorFilter(viewableNotes.userId, noteComments.authorUserId),
				or(isNull(noteReads.readAt), gt(noteComments.createdAt, noteReads.readAt)),
			),
		)

	// a user's count: their notes with an unread edit, plus every note's unread comments
	const unreadEditCount = sql`count(*) filter (where ${toUnreadEditFilter(viewableNotes)})`
	const unreadCommentCount = sql`coalesce(sum((${unreadCommentCountQuery})), 0)`

	// sum each user's notes against their own read time of each
	const noteCountRows = await db
		.with(memberTeams, viewableNotes)
		.select({
			userId: viewableNotes.userId,
			noteCount: sql<number>`(${unreadEditCount} + ${unreadCommentCount})::int`,
		})
		.from(viewableNotes)
		.leftJoin(noteReads, and(eq(noteReads.noteId, viewableNotes.noteId), eq(noteReads.userId, viewableNotes.userId)))
		.groupBy(viewableNotes.userId)
	return new Map(noteCountRows.flatMap(({ userId, noteCount }) => (noteCount > 0 ? [[userId, noteCount]] : [])))
}

// the rule of `toUnreadEdits` as a filter on a user's note beside their read of it: somebody else's edit that the
// user has not opened the note since
function toUnreadEditFilter(viewableNote: {
	userId: SQLWrapper
	bodyEditedAt: SQLWrapper
	lastEditorUserId: SQLWrapper
}): SQL | undefined {
	return and(
		isNotNull(viewableNote.bodyEditedAt),
		sql`${viewableNote.lastEditorUserId} is distinct from ${viewableNote.userId}`,
		or(isNull(noteReads.readAt), gt(viewableNote.bodyEditedAt, noteReads.readAt)),
	)
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

// the pages a badge can name: the user's teams, the topics those teams own or hold, and the teams holding each topic
type BadgedPages = { topicIds: string[]; teamIds: string[]; teamIdsByTopicId: Map<string, string[]> }

// the pages whose notes a user is badged for: their teams, and the topics those teams own or hold
async function loadBadgedPages(userId: string): Promise<BadgedPages> {
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

	// every topic with the teams holding it
	return { topicIds: [...teamIdsByTopicId.keys()], teamIds, teamIdsByTopicId }
}

// how many comments each note received since the user last read it, their own and their blocked people's left out
async function loadUnreadCommentCounts(userId: string, noteIds: string[]): Promise<Map<string, number>> {
	if (noteIds.length === 0) {
		return new Map()
	}

	// count each note's comments from somebody else after the read time. a closed account leaves a null author
	const commentRows = await db
		.select({ noteId: noteComments.noteId, unread: count() })
		.from(noteComments)
		.leftJoin(noteReads, and(eq(noteReads.noteId, noteComments.noteId), eq(noteReads.userId, userId)))
		.where(
			and(
				inArray(noteComments.noteId, noteIds),
				or(isNull(noteComments.authorUserId), ne(noteComments.authorUserId, userId)),
				toNotUserBlockedAuthorFilter(userId, noteComments.authorUserId),
				or(isNull(noteReads.readAt), gt(noteComments.createdAt, noteReads.readAt)),
			),
		)
		.groupBy(noteComments.noteId)
	return new Map(commentRows.map((commentRow) => [commentRow.noteId, commentRow.unread]))
}
