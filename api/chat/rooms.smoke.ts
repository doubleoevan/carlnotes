// a live smoke test for the chat panel's own room list
// run it with: doppler run -- bun api/chat/rooms.smoke.ts. needs Doppler secrets
import { eq, inArray } from "drizzle-orm"
import { connectionPool, db } from "../../db"
import { chatRoomMentions, chatRoomMessages, teamMembers, teams, teamTopics, topics, users } from "../../db/schema"
import { countUnseenChatMentions, loadChatRooms } from "./rooms"

// one stamp per run, and every fixture id derives from it, so a parallel run never collides
const stamp = `rooms-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
const memberId = `${stamp}-member`
const outsiderId = `${stamp}-outsider`
const teamAId = `${stamp}-team-a`
const teamBId = `${stamp}-team-b`
const ownedTopicId = `${stamp}-owned`
const sharedTopicId = `${stamp}-shared`

// each check reports its own line, and one failure fails the run
let failures = 0
function check(label: string, isPassing: boolean, detail?: unknown): void {
	// a pass is one line, and a failure prints what it actually saw
	if (isPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failures += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// one account, named by its own id so a failure names who it was
function toUserRow(id: string): {
	id: string
	name: string
	email: string
	username: string
	usernameNormalized: string
} {
	return { id, name: id, email: `${id}@example.com`, username: id, usernameNormalized: id }
}

// the two people, two teams, and two topics the checks below read
async function seed(): Promise<void> {
	// the two accounts: one on both teams, and the outsider whose empty list proves membership is the key
	await db.insert(users).values([toUserRow(memberId), toUserRow(outsiderId)])

	// team A is made first, so the newer team B and its topics sort ahead of it
	await db.insert(teams).values({ id: teamAId, name: `${stamp} A`, isPublic: true })
	await db.insert(teams).values({ id: teamBId, name: `${stamp} B`, isPublic: true })
	// the member belongs to both, which is what opens every room below
	await db.insert(teamMembers).values([
		{ teamId: teamAId, userId: memberId, role: "leader", isActive: true },
		{ teamId: teamBId, userId: memberId, role: "member", isActive: true },
	])

	// one topic team A owns through the column, and one both teams hold through share rows
	await db.insert(topics).values([
		{ id: ownedTopicId, name: `${stamp} owned`, prompt: "p", ownerId: memberId, teamId: teamAId },
		{ id: sharedTopicId, name: `${stamp} shared`, prompt: "p", ownerId: memberId },
	])
	// the share rows that give the second topic a room in each team
	await db.insert(teamTopics).values([
		{ teamId: teamAId, topicId: sharedTopicId },
		{ teamId: teamBId, topicId: sharedTopicId },
	])
}

// every fixture row, in an order the foreign keys accept
async function cleanUp(): Promise<void> {
	// messages first, then the share rows, then what they were attached to
	await db.delete(chatRoomMessages).where(inArray(chatRoomMessages.teamId, [teamAId, teamBId]))
	await db.delete(teamTopics).where(inArray(teamTopics.teamId, [teamAId, teamBId]))
	await db.delete(topics).where(inArray(topics.id, [ownedTopicId, sharedTopicId]))
	// the memberships and the teams, then the two accounts
	await db.delete(teamMembers).where(inArray(teamMembers.teamId, [teamAId, teamBId]))
	await db.delete(teams).where(inArray(teams.id, [teamAId, teamBId]))
	await db.delete(users).where(inArray(users.id, [memberId, outsiderId]))
}

async function run(): Promise<void> {
	await seed()

	// the member's rooms: both team rooms, the owned topic in team A, and the shared topic in each team
	const chatRooms = await loadChatRooms(memberId)
	const ownChatRooms = chatRooms.filter((chatRoom) => chatRoom.teamId === teamAId || chatRoom.teamId === teamBId)
	check("the member gets a room per team plus one per held topic", ownChatRooms.length === 5, ownChatRooms)
	check(
		"a team's own room has no topic",
		ownChatRooms.filter((chatRoom) => chatRoom.topicId === null).length === 2,
		ownChatRooms.filter((chatRoom) => chatRoom.topicId === null),
	)
	// the pair is what addresses a room, so one topic in two teams is two of them
	check(
		"a topic two teams hold answers one room per team",
		ownChatRooms.filter((chatRoom) => chatRoom.topicId === sharedTopicId).length === 2,
		ownChatRooms.filter((chatRoom) => chatRoom.topicId === sharedTopicId),
	)
	// the owning column and a share row both make a room, and this one comes from the column
	check(
		"the owned topic's room belongs to the team that owns it",
		ownChatRooms.some((chatRoom) => chatRoom.topicId === ownedTopicId && chatRoom.teamId === teamAId),
		ownChatRooms.filter((chatRoom) => chatRoom.topicId === ownedTopicId),
	)

	// newest first, so a panel with no room in mind opens the one most likely wanted
	const chatRoomNames = ownChatRooms.map((chatRoom) => chatRoom.name)
	check(
		"the newest room leads the list",
		chatRoomNames.indexOf(`${stamp} B`) < chatRoomNames.indexOf(`${stamp} A`),
		chatRoomNames,
	)

	// membership is the whole key, so someone on neither team has nothing to open
	const outsiderChatRooms = await loadChatRooms(outsiderId)
	check("an outsider gets no rooms at all", outsiderChatRooms.length === 0, outsiderChatRooms)

	// the badge count follows the mention rows, and a seen row stops counting
	const beforeMentionCount = await countUnseenChatMentions(memberId)
	// one message and one mention row, which is what a badge counts
	const [chatMessageRow] = await db
		.insert(chatRoomMessages)
		.values({ topicId: null, teamId: teamAId, authorUserId: outsiderId, authorUsername: outsiderId, content: "x" })
		.returning({ id: chatRoomMessages.id })
	if (!chatMessageRow) {
		throw new Error("the fixture message did not insert")
	}
	// the unseen row is what a badge counts, and stamping it seen is what clears one
	await db.insert(chatRoomMentions).values({ messageId: chatMessageRow.id, userId: memberId })
	check("an unseen mention raises the count", (await countUnseenChatMentions(memberId)) === beforeMentionCount + 1)
	await db.update(chatRoomMentions).set({ seenAt: new Date() }).where(eq(chatRoomMentions.messageId, chatMessageRow.id))
	check("stamping it seen drops the count back", (await countUnseenChatMentions(memberId)) === beforeMentionCount)
}

try {
	await run()
} finally {
	await cleanUp()
	await connectionPool.end()
}

console.log(failures === 0 ? "\nrooms smoke: every check passed" : `\nrooms smoke: ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
