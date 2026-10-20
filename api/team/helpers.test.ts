// what a team's topics and its own chat room cost this month
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../../db/connectionPoolStub"
import { toSpendByTeamId } from "./helpers"

afterEach(restoreConnectionPool)

// the team's own chat room counts its chat room turns by their kind, never a member's private team chat turn
test("a team's own chat room spend counts its chat room turns by kind", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await toSpendByTeamId(["team-1"])

	// the third query sums the team's own chat room
	const teamChatRoomQuery = sentQueries[2]
	expect(teamChatRoomQuery?.text).toContain('"chat_turns"."kind" = $')
	expect(teamChatRoomQuery?.values).toContain("chat_room")
	expect(teamChatRoomQuery?.text).not.toContain('"room_message_id" is not null')
})
