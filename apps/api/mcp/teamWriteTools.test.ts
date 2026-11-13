// the team write tools: an email invite past the daily limit and an invite to someone who blocked the sender send
// nothing, an accept on a full team joins nothing, a decline answers the invite, and a room post rejects a non-member,
// an objectionable message, and a message to Carl past the daily spend cutoff
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { CHAT_PAUSED_LINE } from "@carlnotes/contracts/chat"
import { toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as dailySpendCutoffs from "@carlnotes/db/dailySpendCutoffs"
import * as inviteLimits from "@carlnotes/db/inviteLimits"
import * as roomAccess from "../chat/roomAccess"
import * as connections from "../connections"
import * as receivedInvites from "../invite/receivedInvites"
import * as moderation from "../moderation"
import * as members from "../team/members"
import * as termsAcceptance from "../termsAcceptance"
import * as userBlocks from "../userBlocks"
import { toResultText, toToolHandler } from "./toolTestFixtures"

// an account that accepted the Terms, and a member of team-1
beforeEach(() => {
	spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(true)
	spyOn(members, "toTeamRole").mockResolvedValue("member")
})

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the queries that write, after the reads
function toWriteQueries(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => !sentQuery.text.startsWith("select"))
}

test("an email invite past the daily limit sends nothing", async () => {
	// nobody holds the address yet, and today's email invites are used
	const sentQueries = stubConnectionPool()
	spyOn(inviteLimits, "canCreateInvitesToday").mockResolvedValue(false)
	const toolResult = await toToolHandler("send_invite")({ team_id: "team-1", email: "new@example.com" })
	expect(toResultText(toolResult)).toContain("Today's email invite limit is reached. Nothing was sent.")
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

test("an invite to someone who blocked the sender sends nothing, in the not-accepting words", async () => {
	// the username's account accepts anyone's invites but blocked the sender
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "users"') ? [["user-3", "b@example.com", "anyone"]] : [],
	)
	spyOn(connections, "isConnected").mockResolvedValue(false)
	spyOn(userBlocks, "hasUserBlock").mockResolvedValue(true)
	const toolResult = await toToolHandler("send_invite")({ team_id: "team-1", username: "blocker" })
	expect(toResultText(toolResult)).toBe("That person is not accepting invites from you. Nothing was sent.")
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

test("an accept on a team at its member limit joins nothing", async () => {
	const acceptSpy = spyOn(receivedInvites, "acceptInvite").mockResolvedValue({
		status: "teamFull",
		teamId: "team-1",
		teamName: "Roasters",
	})
	const toolResult = await toToolHandler("respond_to_invite")({ invite_id: "invite-1", is_accepted: true })
	expect(toResultText(toolResult)).toBe("The team is at its member limit. Nothing was joined.")
	expect(toolResult.isError).toBe(true)
	expect(acceptSpy).toHaveBeenCalledWith("user-1", "invite-1", expect.objectContaining({ entryPoint: "mcp" }))
})

test("a decline answers the invite", async () => {
	const declineSpy = spyOn(receivedInvites, "declineInvite").mockResolvedValue(true)
	const toolResult = await toToolHandler("respond_to_invite")({ invite_id: "invite-1", is_accepted: false })
	expect(toResultText(toolResult)).toBe("Declined the invite.")
	expect(declineSpy).toHaveBeenCalledWith("user-1", "invite-1", expect.objectContaining({ entryPoint: "mcp" }))
})

test("a non-member's room post posts nothing and checks no words", async () => {
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	const moderationSpy = spyOn(moderation, "toObjectionableCategory")
	const toolResult = await toToolHandler("post_to_team_room")({ team_id: "team-1", message: "hello" })
	expect(toResultText(toolResult)).toBe("Only a team's members post in its chat. Nothing was posted.")
	expect(moderationSpy).not.toHaveBeenCalled()
})

test("an objectionable room post posts nothing", async () => {
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue("harassment")
	const sentQueries = stubConnectionPool()
	const toolResult = await toToolHandler("post_to_team_room")({ team_id: "team-1", message: "a rude message" })
	expect(toResultText(toolResult)).toBe(toModerationRejectionMessage("harassment"))
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

test("a message to Carl past the daily spend cutoff posts nothing and says why", async () => {
	// a member past the chat cutoff, with words the moderation passes
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)
	spyOn(dailySpendCutoffs, "isUserPastDailySpendCutoff").mockResolvedValue(true)
	const sentQueries = stubConnectionPool()
	const toolResult = await toToolHandler("post_to_team_room")({ team_id: "team-1", message: "@carl who is hiring?" })
	expect(toResultText(toolResult)).toBe(`Nothing was posted. ${CHAT_PAUSED_LINE}`)
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})
