// the unread note counts the poll last read, plus the notes opened this session that already cleared
import type { NoteBadge } from "@shared/contracts"
import { useSyncExternalStore } from "react"

// the notes opened this session, which clear their badge before the next poll confirms it
const openedNoteIds = new Set<string>()
// what the poll last read
let noteBadges: NoteBadge[] = []
const listeners = new Set<() => void>()
let version = 0

// tell every badge to re-render
function publish(): void {
	version += 1
	for (const listener of listeners) {
		listener()
	}
}

/**
 * Mark a note opened, clearing its badges everywhere they show.
 */
export function markNoteOpened(noteId: string): void {
	openedNoteIds.add(noteId)
	publish()
}

/**
 * Replace the updated note counts with what the poll last read.
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

// the subscribe callback useSyncExternalStore needs. the version number makes one change re-render every consumer
function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

// every hook below re-renders off the same version, so they share one subscription. the third
// snapshot is what a server render reads, and the note table's tests render on the server
function useBadgeVersion(): void {
	useSyncExternalStore(
		subscribe,
		() => version,
		() => version,
	)
}

// the edits and comments waiting on the notes a filter picks, with everything opened this session left out
function toCount(matches: (badge: NoteBadge) => boolean): number {
	return noteBadges
		.filter((badge) => !openedNoteIds.has(badge.noteId) && matches(badge))
		.reduce((total, badge) => total + badge.unreadEdits + badge.unreadComments, 0)
}

/**
 * The unread badges waiting on one page. A topic id picks its topic, otherwise the team's own notes
 * and the notes on every topic the team holds.
 */
export function toPageNoteBadges(topicId: string | null, teamId: string | undefined): NoteBadge[] {
	return noteBadges.filter(
		(badge) =>
			!openedNoteIds.has(badge.noteId) &&
			(topicId ? badge.topicId === topicId : teamId !== undefined && badge.teamIds.includes(teamId)),
	)
}

/** The unread note badges waiting on one page, with what each note holds. */
export function usePageNoteBadges(topicId: string | null, teamId: string | undefined): NoteBadge[] {
	useBadgeVersion()
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
	const noteBadge = openedNoteIds.has(noteId) ? undefined : noteBadges.find((waiting) => waiting.noteId === noteId)
	return { unreadEdits: noteBadge?.unreadEdits ?? 0, unreadComments: noteBadge?.unreadComments ?? 0 }
}

/** Every unread note count the user has. */
export function useAllNoteCount(): number {
	useBadgeVersion()
	return toAllNoteCount()
}

/** Every unread note count waiting on topic-page notes. */
export function useAllTopicNoteCount(): number {
	useBadgeVersion()
	return toCount((badge) => badge.topicId !== null)
}

/** Every unread note count waiting on team-page notes. */
export function useAllTeamNoteCount(): number {
	useBadgeVersion()
	return toAllTeamNoteCount()
}

/** One note's two numbers. */
export function useNoteBadge(noteId: string): { unreadEdits: number; unreadComments: number } {
	useBadgeVersion()
	return toNoteBadge(noteId)
}
