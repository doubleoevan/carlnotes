// a live smoke test for the grouped update count that a push sets as the app icon badge: several accounts counted in
// one read, each equal to that account counted alone and to the note badges that the app shows.
// run it with: bun run smoke:update-counts. needs Doppler secrets

import { toNoteCount } from "@carlnotes/contracts/notes"
import { inArray } from "drizzle-orm"
import { connectionPool, db } from "./index"
import { loadNoteBadges, loadNoteCounts } from "./noteBadges"
import { chatRoomMentions, chatRoomMessages } from "./schema/chat"
import { invites } from "./schema/invites"
import { noteComments, noteReads, notes } from "./schema/notes"
import { reports } from "./schema/reports"
import { teamMembers, teams } from "./schema/teams"
import { teamTopics } from "./schema/teamTopics"
import { subscriptions, topics } from "./schema/topics"
import { userBlocks } from "./schema/userBlocks"
import { users } from "./schema/users"
import { loadUpdateCounts } from "./updateCounts"

// one id per run, and every fixture id derives from it, so a parallel run never collides
const runId = `update-counts-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`

// the five accounts that are counted: a member of two teams, a member who blocked an author, a person on no team, a
// person whose address is not verified, and a person whose request to join is still waiting
const memberId = `${runId}-member`
const blockerId = `${runId}-blocker`
const lonerId = `${runId}-loner`
const unverifiedId = `${runId}-unverified`
const requesterId = `${runId}-requester`

// the two people who write: one nobody blocked, and the one the blocker blocked
const authorId = `${runId}-author`
const blockedAuthorId = `${runId}-blocked-author`
const userIds = [memberId, blockerId, lonerId, unverifiedId, requesterId, authorId, blockedAuthorId]

// the member's two teams, and a team that none of the counted accounts is on
const teamAId = `${runId}-team-a`
const teamBId = `${runId}-team-b`
const otherTeamId = `${runId}-team-other`
const teamIds = [teamAId, teamBId, otherTeamId]

// a topic team A owns, a topic both of the member's teams hold a share of, and the other team's topic
const ownedTopicId = `${runId}-owned`
const sharedTopicId = `${runId}-shared`
const otherTopicId = `${runId}-other`

// the topics that invitations open, one of which the member already subscribes to
const firstInviteTopicId = `${runId}-invite-1`
const secondInviteTopicId = `${runId}-invite-2`
const thirdInviteTopicId = `${runId}-invite-3`
const subscribedTopicId = `${runId}-subscribed`
const inviteTopicIds = [firstInviteTopicId, secondInviteTopicId, thirdInviteTopicId, subscribedTopicId]
const topicIds = [ownedTopicId, sharedTopicId, otherTopicId, ...inviteTopicIds]

// the times a note's edit, its reads, and its comments are compared at, oldest first
const BEFORE_READ = new Date("2026-11-01T09:00:00Z")
const MEMBER_READ = new Date("2026-11-01T10:00:00Z")
const EDITED = new Date("2026-11-01T11:00:00Z")
const AFTER_EDIT = new Date("2026-11-01T12:00:00Z")

// each check reports its own line, and one failure fails the run
let failureCount = 0
function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// a pass is one line, and a failure prints what it actually saw
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// one account, named by its own id so a failure names who it was
function toUserRow(id: string): typeof users.$inferInsert {
	return {
		id,
		name: id,
		email: toEmail(id),
		emailVerified: id !== unverifiedId,
		username: id,
		usernameNormalized: id,
	}
}

// an account's address
function toEmail(userId: string): string {
	return `${userId}@example.com`
}

// the accounts, the teams with their members, and the topics that the checks below read
async function seedPages(): Promise<void> {
	// the accounts and the three teams
	await db.insert(users).values(userIds.map(toUserRow))
	await db.insert(teams).values(teamIds.map((teamId) => ({ id: teamId, name: teamId, isPublic: true })))

	// the member is on both of their teams, the blocker on one, and the requester's membership is not active yet
	await db.insert(teamMembers).values([
		{ teamId: teamAId, userId: memberId, role: "leader", isActive: true },
		{ teamId: teamBId, userId: memberId, role: "member", isActive: true },
		{ teamId: teamAId, userId: blockerId, role: "member", isActive: true },
		{ teamId: teamAId, userId: requesterId, role: "member", isActive: false },
		{ teamId: teamAId, userId: authorId, role: "member", isActive: true },
		{ teamId: otherTeamId, userId: authorId, role: "leader", isActive: true },
		{ teamId: teamAId, userId: blockedAuthorId, role: "member", isActive: true },
	])

	// team A owns one topic through the column, both of the member's teams hold a share of another, and the other
	// team owns a third
	const toTopicRow = (id: string, teamId?: string): typeof topics.$inferInsert => ({
		...{ id, name: id, prompt: "p", ownerId: authorId },
		...(teamId ? { teamId } : {}),
	})
	await db
		.insert(topics)
		.values([
			toTopicRow(ownedTopicId, teamAId),
			toTopicRow(sharedTopicId),
			toTopicRow(otherTopicId, otherTeamId),
			...inviteTopicIds.map((inviteTopicId) => toTopicRow(inviteTopicId)),
		])
	await db.insert(teamTopics).values([
		{ teamId: teamAId, topicId: sharedTopicId },
		{ teamId: teamBId, topicId: sharedTopicId },
	])

	// the member already subscribes to one invited topic, and the blocker blocked one author
	await db.insert(subscriptions).values({ topicId: subscribedTopicId, subscriberUserId: memberId })
	await db.insert(userBlocks).values({ blockerUserId: blockerId, blockedUserId: blockedAuthorId })
}

// one chat room message with the accounts it mentions, and the message's id
async function insertChatMention(
	chatRoom: { teamId: string; topicId: string | null; authorUserId: string | null },
	mentions: { userId: string; seenAt?: Date }[],
): Promise<number> {
	// the message, written under its author's id or a closed account's kept name
	const [chatMessageRow] = await db
		.insert(chatRoomMessages)
		.values({ ...chatRoom, authorUsername: chatRoom.authorUserId ?? "closed-account", content: "x" })
		.returning({ id: chatRoomMessages.id })
	if (!chatMessageRow) {
		throw new Error("the fixture chat message did not insert")
	}

	// one mention row per account that the message names
	await db.insert(chatRoomMentions).values(mentions.map((mention) => ({ messageId: chatMessageRow.id, ...mention })))
	return chatMessageRow.id
}

// the chat mentions: three that count for the member and two for the blocker, among the ones that count for nobody
async function seedChatMentions(): Promise<void> {
	// team A's own chat room names every counted account. a person on no team and a waiting request see none of it
	const everyone = [memberId, blockerId, lonerId, requesterId].map((userId) => ({ userId }))
	await insertChatMention({ teamId: teamAId, topicId: null, authorUserId: authorId }, everyone)

	// the blocked author's message in the owned topic's chat room counts for the member alone
	const ownedTopicChatRoom = { teamId: teamAId, topicId: ownedTopicId, authorUserId: blockedAuthorId }
	await insertChatMention(ownedTopicChatRoom, [{ userId: memberId }, { userId: blockerId }])

	// the shared topic's chat room in team B counts, and a closed account's message counts for the blocker
	await insertChatMention({ teamId: teamBId, topicId: sharedTopicId, authorUserId: authorId }, [{ userId: memberId }])
	await insertChatMention({ teamId: teamAId, topicId: null, authorUserId: null }, [{ userId: blockerId }])

	// a chat room of a topic that team A does not hold, a seen mention, and another team's chat room count nothing
	const unheldTopicChatRoom = { teamId: teamAId, topicId: otherTopicId, authorUserId: authorId }
	await insertChatMention(unheldTopicChatRoom, [{ userId: memberId }])
	const teamChatRoom = { teamId: teamAId, topicId: null, authorUserId: authorId }
	await insertChatMention(teamChatRoom, [{ userId: memberId, seenAt: new Date() }])
	await insertChatMention({ teamId: otherTeamId, topicId: null, authorUserId: authorId }, [{ userId: memberId }])

	// a message that the member reported counts nothing for the member
	const reportedChatMessageId = await insertChatMention(teamChatRoom, [{ userId: memberId }])
	await db.insert(reports).values({
		...{ subjectKind: "chatMessage", subjectId: String(reportedChatMessageId), reporterUserId: memberId },
		...{ reason: "spam", subjectText: "x", subjectPath: "/teams" },
	})
}

// one note on a team's page or a topic's, edited at the edit time unless it names another, and the note's id
async function insertNote(note: Partial<typeof notes.$inferInsert> & { name: string }): Promise<string> {
	const noteId = `${runId}-note-${note.name}`
	await db.insert(notes).values({
		...{ id: noteId, visibility: "team", ownerUserId: authorId, lastEditorUserId: authorId, bodyEditedAt: EDITED },
		...note,
	})
	return noteId
}

// the notes: five unread changes for the member and seven for the blocker
async function seedNotes(): Promise<void> {
	// a team note that the member read before its edit and the blocker never opened
	const teamNoteId = await insertNote({ name: "team", teamId: teamAId })
	await db.insert(noteReads).values({ noteId: teamNoteId, userId: memberId, readAt: MEMBER_READ })

	// its comments: one before the member's read, and after it one by each author, the member, and a closed account
	const toCommentRow = (authorUserId: string | null, createdAt: Date): typeof noteComments.$inferInsert => ({
		...{ noteId: teamNoteId, authorUserId, body: "x", createdAt },
	})
	await db
		.insert(noteComments)
		.values([
			toCommentRow(authorId, BEFORE_READ),
			toCommentRow(authorId, AFTER_EDIT),
			toCommentRow(blockedAuthorId, AFTER_EDIT),
			toCommentRow(memberId, AFTER_EDIT),
			toCommentRow(null, AFTER_EDIT),
		])

	// the shared topic's note is on both of the member's teams and counts once. the member wrote its last edit
	await insertNote({ name: "shared", topicId: sharedTopicId, ownerUserId: memberId, lastEditorUserId: memberId })

	// a private note is its owner's alone: the author's counts for nobody else, and the member's own counts for them
	await insertNote({ name: "others-private", teamId: teamAId, visibility: "private" })
	const ownPrivateNote = { visibility: "private", ownerUserId: memberId, lastEditorUserId: null } as const
	await insertNote({ name: "own-private", teamId: teamAId, ...ownPrivateNote })

	// another team's note and a note nobody edited count nothing
	await insertNote({ name: "other-team", topicId: otherTopicId })
	await insertNote({ name: "unedited", teamId: teamAId, lastEditorUserId: null, bodyEditedAt: null })

	// a note that the member opened after its edit counts for the blocker alone, whoever edited it
	const readNoteId = await insertNote({ name: "read", topicId: ownedTopicId, lastEditorUserId: blockedAuthorId })
	await db.insert(noteReads).values({ noteId: readNoteId, userId: memberId, readAt: AFTER_EDIT })
}

// the invitations: one waiting topic for each of the member, the blocker, the loner, and the unverified person
async function seedInvites(): Promise<void> {
	// a username invitation to a topic, from the author unless it names another person
	const toUsernameInvite = (
		topicId: string,
		invitedUserId: string,
		invite: Partial<typeof invites.$inferInsert> = {},
	): typeof invites.$inferInsert => ({ topicId, invitedUserId, invitedByUserId: authorId, ...invite })

	// the member's username and email invitations to one topic count once
	const memberEmailInvite = { email: toEmail(memberId), invitedByUserId: authorId }
	await db
		.insert(invites)
		.values([toUsernameInvite(firstInviteTopicId, memberId), { topicId: firstInviteTopicId, ...memberEmailInvite }])

	// a declined, a spent, and an expired invitation, one to a subscribed topic, and a team's invitation count nothing
	await db
		.insert(invites)
		.values([
			{ topicId: secondInviteTopicId, ...memberEmailInvite, declinedAt: new Date() },
			toUsernameInvite(secondInviteTopicId, memberId, { usedCount: 1 }),
			toUsernameInvite(thirdInviteTopicId, memberId, { expiresAt: new Date(Date.now() - 60_000) }),
			toUsernameInvite(subscribedTopicId, memberId),
			{ teamId: otherTeamId, invitedUserId: memberId, invitedByUserId: authorId },
		])

	// an address that is not verified matches no email invitation, and its username invitation counts
	await db
		.insert(invites)
		.values([
			{ topicId: firstInviteTopicId, email: toEmail(unverifiedId), invitedByUserId: authorId },
			toUsernameInvite(secondInviteTopicId, unverifiedId),
		])

	// the blocked author's invitation counts nothing for the blocker, and one that has not expired yet counts
	await db
		.insert(invites)
		.values([
			toUsernameInvite(firstInviteTopicId, blockerId, { invitedByUserId: blockedAuthorId }),
			toUsernameInvite(secondInviteTopicId, blockerId, { expiresAt: new Date(Date.now() + 3_600_000) }),
			toUsernameInvite(firstInviteTopicId, lonerId),
		])
}

// every fixture row, in an order the foreign keys accept. a page's delete takes its notes, invitations, and shares
async function cleanUp(): Promise<void> {
	await db.delete(reports).where(inArray(reports.reporterUserId, userIds))
	await db.delete(chatRoomMessages).where(inArray(chatRoomMessages.teamId, teamIds))
	await db.delete(topics).where(inArray(topics.id, topicIds))
	await db.delete(teams).where(inArray(teams.id, teamIds))
	await db.delete(users).where(inArray(users.id, userIds))
}

async function run(): Promise<void> {
	// seed the pages first, then what waits on them
	await seedPages()
	await seedChatMentions()
	await seedNotes()
	await seedInvites()

	// the five accounts in one grouped read: mentions, note changes, and invitations summed for each
	const countedUserIds = [memberId, blockerId, lonerId, unverifiedId, requesterId]
	const updateCounts = await loadUpdateCounts(countedUserIds)
	check("a member of two teams counts 3 mentions, 5 note changes, 1 topic", updateCounts.get(memberId) === 9, [
		...updateCounts,
	])
	check("a blocked author's mention, comment, and invitation are left out", updateCounts.get(blockerId) === 10, [
		...updateCounts,
	])
	check("a person on no team counts their invitation alone", updateCounts.get(lonerId) === 1, [...updateCounts])
	check("an unverified address matches no email invitation", updateCounts.get(unverifiedId) === 1, [...updateCounts])
	check("a waiting request to join counts nothing", updateCounts.get(requesterId) === 0, [...updateCounts])

	// each account counted alone gets the number it got beside the others
	for (const countedUserId of countedUserIds) {
		const ownUpdateCounts = await loadUpdateCounts([countedUserId])
		const isSameAlone = ownUpdateCounts.get(countedUserId) === updateCounts.get(countedUserId)
		check(`${countedUserId} counted alone equals the grouped count`, isSameAlone, [...ownUpdateCounts])
	}

	// the note part equals the sum of the note badges that the app shows each account
	const noteCounts = await loadNoteCounts(countedUserIds)
	for (const countedUserId of countedUserIds) {
		const shownNoteCount = toNoteCount(await loadNoteBadges(countedUserId))
		const isSameAsShown = (noteCounts.get(countedUserId) ?? 0) === shownNoteCount
		check(`${countedUserId}'s note count equals their note badges`, isSameAsShown, [shownNoteCount, ...noteCounts])
	}
}

try {
	await run()
} finally {
	await cleanUp()
	await connectionPool.end()
}

console.log(
	failureCount === 0 ? "\nupdate counts smoke: every check passed" : `\nupdate counts smoke: ${failureCount} failed`,
)
process.exitCode = failureCount === 0 ? 0 : 1
