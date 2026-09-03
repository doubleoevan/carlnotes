// the access checks for notes, decided per visibility from the page access loaded once per request
import type { noteVisibilities } from "@shared/enums"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { notes, teams, topics } from "../../db/schema"
import { loadUserAccess, memberTopicIds } from "../authorization"
import { toTeamRole } from "../team/members"
import { assertNever, canSeeTopic } from "../topic/permissions"

// a note row, and the two row shapes a page can be
type NoteRow = typeof notes.$inferSelect
type PageTopic = Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility" | "teamId" | "name">
type PageTeam = Pick<typeof teams.$inferSelect, "id" | "isPublic" | "name">

// the note's page: the topic page or the team page it lives on
export type NotePage = { kind: "topic"; topic: PageTopic } | { kind: "team"; team: PageTeam }

// what the visibility checks read about one page
export type PageAccess = {
	// whether the page is visible at all
	canSeePage: boolean
	// whether the user actively belongs to a team holding the page
	isHoldingTeamMember: boolean
	// whether the user owns the page. a team page has no owner
	isPageOwner: boolean
	// whether the user is an admin, who reads and deletes every note whatever its visibility
	isAdmin: boolean
}

/**
 * The page access for one request, loaded once and reused by every note decision on the page.
 */
export async function loadPageAccess(userId: string | null, page: NotePage): Promise<PageAccess> {
	// a topic page follows the topic's own visibility, and holding means the owning team or a share
	if (page.kind === "topic") {
		const [isPageVisible, holdingMemberTopicIds, isAdmin] = await Promise.all([
			canSeeTopic(userId, page.topic),
			userId ? memberTopicIds(userId, [page.topic.id]) : Promise.resolve(new Set<string>()),
			toAdmin(userId),
		])

		// the topic's owner is the page owner
		return {
			canSeePage: isPageVisible,
			isHoldingTeamMember: holdingMemberTopicIds.has(page.topic.id),
			isPageOwner: userId !== null && page.topic.ownerId === userId,
			isAdmin,
		}
	}

	// a team page is its own holding team. a private team's page is members only
	const [role, isAdmin] = await Promise.all([toTeamRole(userId, page.team.id), toAdmin(userId)])
	return {
		canSeePage: page.team.isPublic || role !== null,
		isHoldingTeamMember: role !== null,
		isPageOwner: false,
		isAdmin,
	}
}

// whether this caller is an admin. a signed-out visitor never is, so it costs no query
async function toAdmin(userId: string | null): Promise<boolean> {
	if (!userId) {
		return false
	}
	return (await loadUserAccess(userId)).isAdmin
}

/**
 * Whether the note is readable: by its owner for private, a holding-team member for team, anyone for public.
 */
export function canSeeNote(
	userId: string | null,
	note: Pick<NoteRow, "visibility" | "ownerUserId">,
	access: PageAccess,
): boolean {
	// an admin reads every note, on a page they could not otherwise open too
	if (access.isAdmin) {
		return true
	}

	// no note is visible past an invisible page
	if (!access.canSeePage) {
		return false
	}

	// each visibility has its own read rule
	switch (note.visibility) {
		case "private":
			return userId !== null && note.ownerUserId === userId
		case "team":
			return access.isHoldingTeamMember
		case "public":
			return true
		// a new visibility fails to compile here
		default:
			return assertNever(note.visibility)
	}
}

/**
 * Whether the user may write the note's content or comments. Reading plus the visibility's write rule.
 */
export function canEditNote(
	userId: string | null,
	note: Pick<NoteRow, "visibility" | "ownerUserId">,
	access: PageAccess,
): boolean {
	// writing starts from reading, and a signed-out visitor never writes
	if (!userId || !canSeeNote(userId, note, access)) {
		return false
	}
	// public tightens to the page owner and holding-team members. private and team read and write alike
	if (note.visibility === "public") {
		return access.isPageOwner || access.isHoldingTeamMember
	}
	return true
}

/**
 * Whether the user may delete the note: its owner, or an admin moderating any note.
 */
export function canDeleteNote(userId: string | null, note: Pick<NoteRow, "ownerUserId">, access: PageAccess): boolean {
	if (!userId) {
		return false
	}
	return note.ownerUserId === userId || access.isAdmin
}

/**
 * The visibilities the user may create a note in: private when signed in, team as a member,
 * public as the page owner or a member. Empty for a visitor.
 */
export function creatableNoteVisibilities(
	userId: string | null,
	access: PageAccess,
): (typeof noteVisibilities)[number][] {
	// creating takes an account and a visible page
	if (!userId || !access.canSeePage) {
		return []
	}

	// private always, team for members
	const visibilities: (typeof noteVisibilities)[number][] = ["private"]
	if (access.isHoldingTeamMember) {
		visibilities.push("team")
	}

	// public for the page owner and members
	if (access.isPageOwner || access.isHoldingTeamMember) {
		visibilities.push("public")
	}
	return visibilities
}

/**
 * The note row with its page resolved, or null when either is missing.
 */
export async function loadNoteWithPage(noteId: string): Promise<{ note: NoteRow; page: NotePage } | null> {
	// the row names exactly one page by its check constraint
	const [note] = await db.select().from(notes).where(eq(notes.id, noteId))
	if (!note) {
		return null
	}
	const page = await loadNotePage(note)
	return page ? { note, page } : null
}

// the page row a note points at, or null when the page is gone
async function loadNotePage(note: Pick<NoteRow, "topicId" | "teamId">): Promise<NotePage | null> {
	if (note.topicId) {
		return loadTopicPage(note.topicId)
	}
	if (note.teamId) {
		return loadTeamPage(note.teamId)
	}

	// unreachable while the one-page check constraint holds
	return null
}

/**
 * Loads a topic as a note page: the gate fields plus the name.
 */
export async function loadTopicPage(topicId: string): Promise<NotePage | null> {
	// biome-ignore format: one line keeps the select under the comment-density hook's limit
	const [topic] = await db
		.select({ id: topics.id, ownerId: topics.ownerId, visibility: topics.visibility, teamId: topics.teamId, name: topics.name })
		.from(topics)
		.where(eq(topics.id, topicId))
	return topic ? { kind: "topic", topic } : null
}

/**
 * Loads a team as a note page: the page gate plus the name.
 */
export async function loadTeamPage(teamId: string): Promise<NotePage | null> {
	const [team] = await db
		.select({ id: teams.id, isPublic: teams.isPublic, name: teams.name })
		.from(teams)
		.where(eq(teams.id, teamId))
	return team ? { kind: "team", team } : null
}
