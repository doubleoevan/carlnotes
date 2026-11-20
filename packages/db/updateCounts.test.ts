// the grouped update count: several users' unseen chat mentions, unread note changes, and pending topic invitations
// summed from three reads, never one user at a time. the counts on real rows are checked by updateCounts.smoke.ts
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "./connectionPoolStub"
import { loadUpdateCounts } from "./updateCounts"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// the three grouped reads, each named by how its statement starts
const CHAT_MENTION_READ = 'select "room_mentions"."user_id", count(*)'
const NOTE_READ = 'with "member_teams" as'
const TOPIC_INVITE_READ = 'select "users"."id", count(distinct "invites"."topic_id")'

// answer each grouped read with its rows: a user's id beside their count
function stubUpdateCountRows(rowsByRead: Record<string, unknown[][]>): SentQuery[] {
	return stubConnectionPool(({ text }) => {
		const read = Object.keys(rowsByRead).find((readStart) => text.startsWith(readStart))
		return read ? (rowsByRead[read] ?? []) : []
	})
}

test("each user's count sums their mentions, note changes, and invitations, and nothing waiting is 0", async () => {
	// user-1 has all three parts, user-2 has note changes alone, and user-3 has nothing
	const sentQueries = stubUpdateCountRows({
		[CHAT_MENTION_READ]: [["user-1", 2]],
		[NOTE_READ]: [
			["user-1", 4],
			["user-2", 5],
		],
		[TOPIC_INVITE_READ]: [["user-1", 1]],
	})
	const updateCounts = await loadUpdateCounts(["user-1", "user-2", "user-3"])
	expect([...updateCounts]).toEqual([
		["user-1", 7],
		["user-2", 5],
		["user-3", 0],
	])

	// three reads for the three users together, each naming all of them
	expect(sentQueries).toHaveLength(3)
	for (const readStart of [CHAT_MENTION_READ, NOTE_READ, TOPIC_INVITE_READ]) {
		const readQueries = sentQueries.filter((sentQuery) => sentQuery.text.startsWith(readStart))
		expect(readQueries).toHaveLength(1)
		expect(readQueries[0]?.values).toEqual(expect.arrayContaining(["user-1", "user-2", "user-3"]))
	}
})

test("no user reads nothing", async () => {
	const sentQueries = stubUpdateCountRows({})
	expect(await loadUpdateCounts([])).toEqual(new Map())
	expect(sentQueries).toEqual([])
})

// each read compares a row against its own user, so one user's block, report, read time, or team never decides
// another user's count
test("each grouped read judges a row by its own user", async () => {
	const sentQueries = stubUpdateCountRows({})
	await loadUpdateCounts(["user-1", "user-2"])
	const findRead = (readStart: string): string =>
		sentQueries.find((sentQuery) => sentQuery.text.startsWith(readStart))?.text ?? ""

	// a mention counts in a chat room of a team its user is an active member of, less their blocks and reports
	const chatMentionRead = findRead(CHAT_MENTION_READ)
	expect(chatMentionRead).toContain('"team_members"."user_id" = "room_mentions"."user_id"')
	expect(chatMentionRead).toContain('"team_members"."is_active" = $')
	expect(chatMentionRead).toContain('"user_blocks"."blocker_user_id" = "room_mentions"."user_id"')
	expect(chatMentionRead).toContain('"reports"."reporter_user_id" = "room_mentions"."user_id"')
	expect(chatMentionRead).toContain('group by "room_mentions"."user_id"')

	// a note is read against its user's own read time, private notes are their owner's, and blocks are the user's
	const noteRead = findRead(NOTE_READ)
	expect(noteRead).toContain('"note_reads"."user_id" = "viewable_notes"."user_id"')
	expect(noteRead).toContain('"notes"."owner_user_id" = "member_teams"."user_id"')
	expect(noteRead).toContain('"user_blocks"."blocker_user_id" = "viewable_notes"."user_id"')
	expect(noteRead).toContain('is distinct from "viewable_notes"."user_id"')
	expect(noteRead).toContain('group by "viewable_notes"."user_id"')

	// an invitation is matched to the user it addresses, by username or by a verified address
	const topicInviteRead = findRead(TOPIC_INVITE_READ)
	expect(topicInviteRead).toContain('"invites"."invited_user_id" = "users"."id"')
	expect(topicInviteRead).toContain('"users"."email_verified" = $')
	expect(topicInviteRead).toContain('"invites"."email" = "users"."email"')
	expect(topicInviteRead).toContain('"subscriptions"."subscriber_user_id" = "users"."id"')
	expect(topicInviteRead).toContain('group by "users"."id"')
})
