// a live smoke test for the team chat room's access and write guarantees
// run it with: doppler run -- bun api/chat/room.smoke.ts. needs Doppler secrets
import type { PoolClient } from "@neondatabase/serverless"
import { toNormalizedUsername } from "@shared/usernames"
import { count, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { connectionPool, db } from "../../db"
import {
	chatRoomMentions,
	chatRoomMessages,
	chatTurns,
	subscriptions,
	teamMembers,
	teams,
	teamTopics,
	topics,
	users,
} from "../../db/schema"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { removeTeamMember } from "../team/members"
import { loadTopicChatMentions } from "./mentions"
import { chatRoomRoute, postChatRoomMessage } from "./room"
import { loadChatRoomMessages } from "./roomMessages"

// one id per run, and every fixture id derives from it, so a parallel run never collides
const runId = `room-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`

// the two teams and the two topics: the shared topic both teams hold, and one no team holds
const topicId = `${runId}-topic`
const unheldTopicId = `${runId}-unheld`
const teamAId = `${runId}-team-a`
const teamBId = `${runId}-team-b`

// the six users, each named for the part it plays: the topic's owner who joins no team, team A's
// leader and the member who leaves it, team B's leader, a subscriber on no team, and a spent budget
const ownerId = `${runId}-owner`
const leaderId = `${runId}-leader`
const removedMemberId = `${runId}-removed-member`
const otherTeamLeaderId = `${runId}-other-team-leader`
const subscriberId = `${runId}-subscriber`
const spenderId = `${runId}-spender`

// the chat room routes behind a session shim that signs each request in as the chosen user
let routeUserId: string | null = null
const routeApp = new Hono<AppEnv>()
	.use("*", async (context, next) => {
		context.set("user", routeUserId === null ? null : ({ id: routeUserId } as SessionUser))
		await next()
	})
	.route("/", chatRoomRoute)

// the chat messages route's status for one user reading team A's chat room on the shared topic
async function readChatRoomStatus(userId: string): Promise<number> {
	routeUserId = userId
	const response = await routeApp.request(`/topics/${topicId}/rooms/${teamAId}`)
	return response.status
}

// one check: log the PASS line, or throw an error so the run fails loud
function check(isPassed: boolean, label: string): void {
	if (!isPassed) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

// post into a chat room on the shared topic and hand back the stored chat message id, failing loud on a denial
async function postAsTeamMember(userId: string, chatRoomTeamId: string, content: string): Promise<number> {
	const chatPostResult = await postChatRoomMessage(userId, topicId, chatRoomTeamId, content, null, [])
	if (
		chatPostResult === null ||
		chatPostResult === "attachmentRejected" ||
		chatPostResult === "attachmentLimitReached" ||
		chatPostResult.rejectionReason !== null
	) {
		throw new Error(`FAIL  the post as ${userId} did not store: ${JSON.stringify(chatPostResult)}`)
	}
	return chatPostResult.chatMessageId
}

// how many chat room messages the shared topic has stored, across both of its chat rooms
async function countChatRoomMessages(): Promise<number> {
	const [messageCountRow] = await db
		.select({ count: count() })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.topicId, topicId))
	return messageCountRow?.count ?? -1
}

// seed the people, the teams, the shared topic both teams hold, and a topic no team holds
async function seedFixtures(): Promise<void> {
	// six people sharing the run id. the spender's one-cent override lets one cost row exhaust them
	const labels = ["owner", "leader", "removed-member", "other-team-leader", "subscriber", "spender"] as const
	await db.insert(users).values(
		labels.map((label) => ({
			id: `${runId}-${label}`,
			name: label,
			email: `${runId}-${label}@carlnotes.test`,
			username: `${runId}-${label}`,
			usernameNormalized: toNormalizedUsername(`${runId}-${label}`),
			budgetOverrideCents: label === "spender" ? 1 : null,
		})),
	)

	// two teams, each with the shared topic through a share row, so each has its own chat room on it
	await db.insert(teams).values([
		{ id: teamAId, name: `${runId}-a` },
		{ id: teamBId, name: `${runId}-b` },
	])

	// team A has a leader, the removal target, and the spender. team B has one leader
	await db.insert(teamMembers).values([
		{ teamId: teamAId, userId: leaderId, role: "leader" },
		{ teamId: teamAId, userId: removedMemberId },
		{ teamId: teamAId, userId: spenderId },
		{ teamId: teamBId, userId: otherTeamLeaderId, role: "leader" },
	])

	// both topics belong to the owner, who joins neither team
	await db.insert(topics).values([
		{ id: topicId, ownerId, name: "room smoke topic" },
		{ id: unheldTopicId, ownerId, name: "room smoke unheld topic" },
	])
	await db.insert(teamTopics).values([
		{ teamId: teamAId, topicId },
		{ teamId: teamBId, topicId },
	])

	// a subscription with no membership, and the cost row that exhausts the spender's one-cent budget
	await db.insert(subscriptions).values({ topicId, subscriberUserId: subscriberId })
	await db.insert(chatTurns).values({ userId: spenderId, topicId, cost: "100" })
}

// section 1: the access matrix through the real functions. membership alone opens a held topic's chat room
async function checkAccessMatrix(): Promise<void> {
	console.log("\n=== 1. access matrix ===")

	// a subscriber who is not a member is denied on both the post and the read
	const subscriberPost = await postChatRoomMessage(subscriberId, topicId, teamAId, "hi", null, [])
	check(subscriberPost === null, "a non-member subscriber's post answers null")
	check((await readChatRoomStatus(subscriberId)) === 404, "a non-member subscriber's read answers 404")

	// a member of team A has no chat room on team B's side of the shared topic
	const crossTeamPost = await postChatRoomMessage(leaderId, topicId, teamBId, "hi", null, [])
	check(crossTeamPost === null, "a team A member's post to team B's room answers null")

	// a topic no team holds has no chat room at all
	const unheldTopicPost = await postChatRoomMessage(leaderId, unheldTopicId, teamAId, "hi", null, [])
	check(unheldTopicPost === null, "a post on a topic no team holds answers null")

	// ownership grants no chat room. the owner belongs to neither team
	const ownerPost = await postChatRoomMessage(ownerId, topicId, teamAId, "hi", null, [])
	check(ownerPost === null, "the owner's post without membership answers null")
	check((await readChatRoomStatus(ownerId)) === 404, "the owner's read without membership answers 404")

	// a member posts into their own chat room and reads it back decrypted
	await postAsTeamMember(leaderId, teamAId, "hello room a")
	check((await readChatRoomStatus(leaderId)) === 200, "a member's read answers 200")
	const teamAChatMessages = await loadChatRoomMessages(topicId, teamAId, 0)
	check(
		teamAChatMessages.some(
			(chatMessage) => chatMessage.content === "hello room a" && chatMessage.authorUserId === leaderId,
		),
		"the member's chat message reads back decrypted",
	)
}

// section 2: each team's chat room on the topic is its own. a chat message in one never shows in the other
async function checkChatRoomIsolation(): Promise<void> {
	console.log("\n=== 2. room isolation ===")

	// team B's member posts into team B's chat room on the same shared topic
	await postAsTeamMember(otherTeamLeaderId, teamBId, "hello room b")

	// each chat room reads back only its own chat messages
	const teamAChatMessages = await loadChatRoomMessages(topicId, teamAId, 0)
	const teamBChatMessages = await loadChatRoomMessages(topicId, teamBId, 0)
	check(
		teamAChatMessages.every((chatMessage) => chatMessage.content !== "hello room b"),
		"team B's chat message never shows in team A's room",
	)
	check(
		teamBChatMessages.every((chatMessage) => chatMessage.content !== "hello room a"),
		"team A's chat message never shows in team B's room",
	)
	check(
		teamBChatMessages.some((chatMessage) => chatMessage.content === "hello room b"),
		"team B's room reads back its own chat message",
	)
}

// section 3: removal denies the removed member on the next request while their stored chat messages remain
async function checkRemovalNextRequest(): Promise<void> {
	console.log("\n=== 3. removal on the next request ===")

	// the target posts while still a member, then removes themself
	await postAsTeamMember(removedMemberId, teamAId, "posted before leaving")
	check(
		(await removeTeamMember(removedMemberId, teamAId, removedMemberId)) === "removed",
		"the self-removal answers removed",
	)

	// their next post and read are denied
	const removedPost = await postChatRoomMessage(removedMemberId, topicId, teamAId, "hi again", null, [])
	check(removedPost === null, "the removed member's post answers null")
	check((await readChatRoomStatus(removedMemberId)) === 404, "the removed member's read answers 404")

	// the chat room keeps their chat message for the members left, who still read it
	const teamAChatMessages = await loadChatRoomMessages(topicId, teamAId, 0)
	check(
		teamAChatMessages.some((chatMessage) => chatMessage.content === "posted before leaving"),
		"the removed member's chat message remains stored",
	)
	check((await readChatRoomStatus(leaderId)) === 200, "a remaining member still reads the room")
}

// section 4: an exhausted budget rejects privately before anything posts or spends
async function checkBudgetRejection(): Promise<void> {
	console.log("\n=== 4. budget rejection ===")

	// the chat room's stored row count before the rejected post
	const chatMessagesBeforeCount = await countChatRoomMessages()

	// the seeded cost row exhausts the spender's one-cent override, so addressing carl rejects
	const rejected = await postChatRoomMessage(spenderId, topicId, teamAId, "@carl hello", null, [])
	const isRejection = typeof rejected === "object" && rejected !== null
	check(isRejection && rejected.chatMessageId === 0, "the rejection answers chat message id 0")
	check(isRejection && (rejected.rejectionReason ?? "") !== "", "the rejection includes its reason")
	check((await countChatRoomMessages()) === chatMessagesBeforeCount, "the rejected post stored no room chat message")
}

// section 5: chat mention rows. a named member gets one row, and the author and a plain post get none
async function checkChatRoomMentions(): Promise<void> {
	console.log("\n=== 5. mention rows ===")

	// a post naming the author and one member writes one row for the named member alone
	const namedMessageId = await postAsTeamMember(leaderId, teamAId, `@${leaderId} @${spenderId} please read`)
	const namedRows = await db.select().from(chatRoomMentions).where(eq(chatRoomMentions.messageId, namedMessageId))
	check(
		namedRows.length === 1 && namedRows[0]?.userId === spenderId,
		"one mention row for the named member, none for the author or carl",
	)

	// plain content mentions nobody, so the write path stores no rows for it
	const plainMessageId = await postAsTeamMember(leaderId, teamAId, "no mentions in this one")
	const plainRows = await db.select().from(chatRoomMentions).where(eq(chatRoomMentions.messageId, plainMessageId))
	check(plainRows.length === 0, "a plain unaddressed post writes no mention rows")
}

// section 7: the chat mention badge lifecycle: a reply notifies its author, the badge returns unseen rows alone
async function checkMentionBadges(): Promise<void> {
	console.log("\n=== 7. mention badges ===")

	// a plain reply notifies the replied-to author without naming them
	const parentId = await postAsTeamMember(leaderId, teamAId, "what does the room think")
	const replied = await postChatRoomMessage(spenderId, topicId, teamAId, "replying to that", parentId, [])
	check(typeof replied === "object" && replied !== null && replied.chatMessageId > 0, "the reply stored")

	// the badge reports the reply with its reply flag, its chat room team, and the decrypted opening
	const badge = (await loadTopicChatMentions(leaderId, [topicId])).get(topicId)?.at(0)
	check(badge?.isReply === true && badge.teamId === teamAId, "the badge answers the reply with its room team")
	check(badge?.excerpt === "replying to that", "the excerpt is the decrypted opening")

	// the chat messages read alone clears nothing. it fires on page mount with the panel still closed
	check((await readChatRoomStatus(leaderId)) === 200, "the mentioned member reads the room")
	check(
		(await loadTopicChatMentions(leaderId, [topicId])).size === 1,
		"the chat messages read leaves the badge standing",
	)

	// opening the panel posts the seen time through the route, which clears the badge
	routeUserId = leaderId
	const saved = await routeApp.request(`/topics/${topicId}/rooms/${teamAId}/mentions-seen`, { method: "POST" })
	check(saved.status === 200, "saving seen answers 200 for a member")
	check((await loadTopicChatMentions(leaderId, [topicId])).size === 0, "the open cleared the badge")
}

// section 6: the per-room advisory lock, on the same hashtext key the chat room turn takes
async function checkAdvisoryLock(): Promise<void> {
	console.log("\n=== 6. advisory lock ===")

	// two raw connections from the pool, so two open transactions can contend for the key
	const holdingClient = await connectionPool.connect()
	const contendingClient = await connectionPool.connect()
	try {
		// the first transaction takes team A's chat room key and holds it open
		await holdingClient.query("begin")
		await holdingClient.query("select pg_advisory_xact_lock(hashtext($1))", [`${topicId}:${teamAId}`])

		// the second transaction times out waiting on the same key
		await contendingClient.query("begin")
		await contendingClient.query("set local statement_timeout = 1500")
		const isSameKeyBlocked = await isLockAcquireTimedOut(contendingClient, `${topicId}:${teamAId}`)
		await contendingClient.query("rollback")
		check(isSameKeyBlocked, "the same room key blocks while held")

		// a different chat room's key acquires immediately under the same timeout
		await contendingClient.query("begin")
		await contendingClient.query("set local statement_timeout = 1500")
		const isOtherKeyBlocked = await isLockAcquireTimedOut(contendingClient, `${topicId}:${teamBId}`)
		await contendingClient.query("rollback")
		check(!isOtherKeyBlocked, "a different room's key does not block")

		// release team A's key
		await holdingClient.query("rollback")
	} finally {
		// destroy both raw connections, so a failed step cannot leave a held lock behind
		holdingClient.release(true)
		contendingClient.release(true)
	}
}

// section 8: the backward cursor, which lets a mention more than one page back still be reached.
// crossing the real 500 page boundary would write 501 rows per run, so this proves the query instead
async function checkBackwardCursor(): Promise<void> {
	console.log("\n=== 8. backward cursor ===")

	// five chat messages in one room, so there is something on both sides of a cursor
	const postedChatMessageIds: number[] = []
	for (const content of ["one", "two", "three", "four", "five"]) {
		postedChatMessageIds.push(await postAsTeamMember(leaderId, teamAId, `cursor ${content}`))
	}
	const loadedChatMessages = await loadChatRoomMessages(topicId, teamAId, 0)
	const cursorChatMessageId = postedChatMessageIds[2]
	if (cursorChatMessageId === undefined) {
		check(false, "the room held the five chat messages this section posts")
		return
	}

	// the page above the cursor holds only what is below it, still earliest first
	const earlierChatMessages = await loadChatRoomMessages(topicId, teamAId, 0, cursorChatMessageId)
	const earlierChatMessageIds = earlierChatMessages.map((chatMessage) => chatMessage.id)
	check(
		earlierChatMessageIds.every((id) => id < cursorChatMessageId),
		"the page above a cursor holds no chat message at or past it",
	)
	check(
		earlierChatMessageIds.includes(postedChatMessageIds[0] as number) &&
			earlierChatMessageIds.includes(postedChatMessageIds[1] as number),
		"the page above a cursor holds the chat messages below it",
	)
	check(
		earlierChatMessageIds.every((id, index) => index === 0 || id > (earlierChatMessageIds[index - 1] as number)),
		"the page above a cursor comes back earliest first, the way the latest page does",
	)

	// the room's first chat message has nothing above it, so the list stops asking
	const firstChatMessageId = loadedChatMessages[0]?.id
	check(
		firstChatMessageId !== undefined &&
			(await loadChatRoomMessages(topicId, teamAId, 0, firstChatMessageId)).length === 0,
		"the page above the room's first chat message is empty",
	)
}

// whether acquiring the chat room key times out inside the client's open transaction. a timeout means the key is held
async function isLockAcquireTimedOut(client: PoolClient, roomKey: string): Promise<boolean> {
	try {
		await client.query("select pg_advisory_xact_lock(hashtext($1))", [roomKey])
		return false
	} catch (error) {
		// 57014 is postgres's query_canceled, the one failure the statement timeout produces
		if ((error as { code?: string }).code !== "57014") {
			throw error
		}
		return true
	}
}

// delete the people, whose rows cascade to the topics, chat rooms, chat mentions, chat turns
async function cleanupFixtures(): Promise<void> {
	console.log("\n=== cleanup ===")
	await db
		.delete(users)
		.where(inArray(users.id, [ownerId, leaderId, removedMemberId, otherTeamLeaderId, subscriberId, spenderId]))
	await db.delete(teams).where(inArray(teams.id, [teamAId, teamBId]))
	check((await countChatRoomMessages()) === 0, "no room chat message survives the fixture delete")
}

// seed, run every section in order, and always clean up. any failed check throws an error and fails the run
console.log(`\n=== team room smoke (run ${runId}) ===`)
let exitCode = 0
try {
	// the fixtures first, then the seven sections
	await seedFixtures()
	await checkAccessMatrix()
	await checkChatRoomIsolation()
	await checkRemovalNextRequest()
	await checkBudgetRejection()
	await checkChatRoomMentions()
	await checkAdvisoryLock()
	await checkMentionBadges()
	await checkBackwardCursor()

	// every check passed
	console.log("\n=== smoke PASSED ===")
} catch (error) {
	// a failed check fails the run
	console.error(error)
	exitCode = 1
} finally {
	// cleanup runs even after a failure, and its own failure fails the run
	try {
		await cleanupFixtures()
	} catch (cleanupError) {
		console.error(cleanupError)
		exitCode = 1
	}
}

// close the pool so the process exits on its own, then report the outcome as the exit code
await connectionPool.end()
process.exitCode = exitCode
