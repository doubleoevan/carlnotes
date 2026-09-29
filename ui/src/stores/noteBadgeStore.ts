// the unread note counts the poll last read, plus the notes opened this session that already cleared
import type { NoteBadge } from "@shared/contracts"
import { toStoreListeners } from "@/stores/storeListeners"

// the notes opened this session, which clear their badge before the next poll confirms it
const openedNoteIds = new Set<string>()
// what the poll last read
let noteBadges: NoteBadge[] = []
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Marks a note opened, which clears its badges everywhere they show.
 */
export function markNoteOpened(noteId: string): void {
	openedNoteIds.add(noteId)
	publish()
}

/**
 * Replaces the note badge counts with what the poll last read.
 */
export function setNoteBadges(updatedNoteBadges: NoteBadge[]): void {
	noteBadges = updatedNoteBadges

	// a note the poll no longer counts has been cleared on the server, so the local mark can go
	for (const noteId of openedNoteIds) {
		if (!updatedNoteBadges.some((badge) => badge.noteId === noteId)) {
			openedNoteIds.delete(noteId)
		}
	}
	publish()
}

// the edits and comments waiting on the notes a filter picks, with everything opened this session left out
function toCount(matches: (badge: NoteBadge) => boolean): number {
	return noteBadges
		.filter((noteBadge) => !openedNoteIds.has(noteBadge.noteId) && matches(noteBadge))
		.reduce((total, badge) => total + badge.unreadEdits + badge.unreadComments, 0)
}

/**
 * The unread badges waiting on one page. A topic id shows its topic badges.
 * A team id shows its team's notes and the notes on every topic of the team.
 */
export function toPageNoteBadges(topicId: string | null, teamId: string | undefined): NoteBadge[] {
	return noteBadges.filter(
		(badge) =>
			!openedNoteIds.has(badge.noteId) &&
			(topicId ? badge.topicId === topicId : teamId !== undefined && badge.teamIds.includes(teamId)),
	)
}

/** The unread note badges waiting on one page, with each note's unread edits and comments. */
export function usePageNoteBadges(topicId: string | null, teamId: string | undefined): NoteBadge[] {
	useStoreVersion()
	return toPageNoteBadges(topicId, teamId)
}

/**
 * The unread note count waiting on a topic, its edits and comments summed.
 */
export function toTopicNoteCount(topicId: string): number {
	return toCount((badge) => badge.topicId === topicId)
}

/**
 * Every unread note count the user has, across topics and teams alike.
 */
export function toAllNoteCount(): number {
	return toCount(() => true)
}

/**
 * Every unread note count waiting on team-page notes.
 */
export function toAllTeamNoteCount(): number {
	return toCount((badge) => badge.teamId !== null)
}

/**
 * One note's two numbers, kept separate for the note's own row. Zeroes for a note with nothing waiting.
 */
export function toNoteBadge(noteId: string): { unreadEdits: number; unreadComments: number } {
	const noteBadge = openedNoteIds.has(noteId) ? undefined : noteBadges.find((badge) => badge.noteId === noteId)
	return { unreadEdits: noteBadge?.unreadEdits ?? 0, unreadComments: noteBadge?.unreadComments ?? 0 }
}

/** Reads every unread note badge the user has, with the notes opened this session left out. */
export function useAllNoteBadges(): NoteBadge[] {
	useStoreVersion()
	return noteBadges.filter((noteBadge) => !openedNoteIds.has(noteBadge.noteId))
}

/** Reads every unread note count the user has. */
export function useAllNoteCount(): number {
	useStoreVersion()
	return toAllNoteCount()
}

/** One note's two numbers. */
export function useNoteBadge(noteId: string): { unreadEdits: number; unreadComments: number } {
	useStoreVersion()
	return toNoteBadge(noteId)
}
