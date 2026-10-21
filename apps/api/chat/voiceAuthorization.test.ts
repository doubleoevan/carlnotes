// voice authorization tests: each page kind asks its own chat turn gate, a chat room asks membership and the monthly
// spend gate, with every rejection kept, and the access check asks the page's access rules alone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as authorization from "../authorization"
import * as teamMembers from "../team/members"
import * as chatTurnAuthorization from "./chatTurnAuthorization"
import * as roomAccess from "./roomAccess"
import { authorizeVoiceChatPage, authorizeVoiceChatPageAccess } from "./voiceAuthorization"

// put the spies and the connection pool's own query back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// a topic page asks the topic chat turn's gate, keeps each rejection, and names the user alone if allowed
test("a topic page answers as its chat turn would", async () => {
	const topicPage = { kind: "topic", topicId: "topic-1" } as const
	const authorizeChatTurnSpy = spyOn(chatTurnAuthorization, "authorizeChatTurn").mockResolvedValue({
		status: "forbidden",
	})
	expect(await authorizeVoiceChatPage("user-1", topicPage)).toEqual({ status: "forbidden" })
	expect(authorizeChatTurnSpy).toHaveBeenCalledWith("user-1", "topic-1")

	// a visitor and a spent budget pass through
	authorizeChatTurnSpy.mockResolvedValue({ status: "signup" })
	expect(await authorizeVoiceChatPage(null, topicPage)).toEqual({ status: "signup" })
	authorizeChatTurnSpy.mockResolvedValue({ status: "budget", userId: "user-1" })
	expect(await authorizeVoiceChatPage("user-1", topicPage)).toEqual({ status: "budget", userId: "user-1" })

	// an allowed chat turn names the user and nothing else
	authorizeChatTurnSpy.mockResolvedValue({
		status: "allowed",
		userId: "user-1",
		isTopicOwner: true,
		isPersisted: true,
		canEditTopic: true,
	})
	expect(await authorizeVoiceChatPage("user-1", topicPage)).toEqual({ status: "allowed", userId: "user-1" })
})

// a team page and the new-topic chat ask their own gates
test("a team page and the new-topic chat answer as their chat turns would", async () => {
	const authorizeTeamChatTurnSpy = spyOn(chatTurnAuthorization, "authorizeTeamChatTurn").mockResolvedValue({
		status: "forbidden",
	})
	expect(await authorizeVoiceChatPage("user-1", { kind: "team", teamId: "team-1" })).toEqual({ status: "forbidden" })
	expect(authorizeTeamChatTurnSpy).toHaveBeenCalledWith("user-1", "team-1")

	// the new-topic chat is gated by the monthly spend alone
	const authorizeNewTopicChatTurnSpy = spyOn(chatTurnAuthorization, "authorizeNewTopicChatTurn").mockResolvedValue({
		status: "budget",
		userId: "user-1",
	})
	expect(await authorizeVoiceChatPage("user-1", { kind: "newTopic" })).toEqual({ status: "budget", userId: "user-1" })
	expect(authorizeNewTopicChatTurnSpy).toHaveBeenCalledWith("user-1")
})

// a chat room sends a visitor to signup, answers like a missing one for a non-member, rejects a spent budget before any
// model is called, and otherwise allows the member
test("a chat room answers by membership and the monthly spend gate", async () => {
	const roomPage = { kind: "room", topicId: "topic-1", teamId: "team-1" } as const
	expect(await authorizeVoiceChatPage(null, roomPage)).toEqual({ status: "signup" })

	// a chat room the user may not use is a missing one
	const loadChatRoomSpy = spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(true)
	expect(await authorizeVoiceChatPage("user-1", roomPage)).toEqual({ status: "notFound" })
	expect(loadChatRoomSpy).toHaveBeenCalledWith("user-1", "topic-1", "team-1")
	expect(isMonthlySpendExhaustedSpy).not.toHaveBeenCalled()

	// a member whose budget is spent, then a member under budget
	loadChatRoomSpy.mockResolvedValue({ topic: null, teamId: "team-1" })
	expect(await authorizeVoiceChatPage("user-1", roomPage)).toEqual({ status: "budget", userId: "user-1" })
	isMonthlySpendExhaustedSpy.mockResolvedValue(false)
	expect(await authorizeVoiceChatPage("user-1", roomPage)).toEqual({ status: "allowed", userId: "user-1" })
})

// the access check decides each page by its access rules alone, and never runs a chat turn gate or a spend sum
test("the access check answers by the page's access rules and never reads a budget", async () => {
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(true)
	const chatTurnGateSpies = [
		spyOn(chatTurnAuthorization, "authorizeChatTurn"),
		spyOn(chatTurnAuthorization, "authorizeTeamChatTurn"),
		spyOn(chatTurnAuthorization, "authorizeNewTopicChatTurn"),
	]

	// a visible topic allows the user, an invisible one is forbidden, and a missing one is forbidden too
	stubConnectionPool(() => [["topic-1", "owner-1", "public", null]])
	const isAllowedSpy = spyOn(authorization, "isAllowed").mockResolvedValue(true)
	const topicPage = { kind: "topic", topicId: "topic-1" } as const
	expect(await authorizeVoiceChatPageAccess("user-1", topicPage)).toEqual({ status: "allowed", userId: "user-1" })
	expect(isAllowedSpy).toHaveBeenCalledWith("user-1", "topic:view", {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: null,
	})
	isAllowedSpy.mockResolvedValue(false)
	expect(await authorizeVoiceChatPageAccess("user-1", topicPage)).toEqual({ status: "forbidden" })
	stubConnectionPool(() => [])
	expect(await authorizeVoiceChatPageAccess("user-1", topicPage)).toEqual({ status: "forbidden" })

	// a team page needs an active member
	const toTeamRoleSpy = spyOn(teamMembers, "toTeamRole").mockResolvedValue(null)
	const teamPage = { kind: "team", teamId: "team-1" } as const
	expect(await authorizeVoiceChatPageAccess("user-1", teamPage)).toEqual({ status: "forbidden" })
	toTeamRoleSpy.mockResolvedValue("member")
	expect(await authorizeVoiceChatPageAccess("user-1", teamPage)).toEqual({ status: "allowed", userId: "user-1" })

	// the new-topic chat needs a signed-in user alone
	expect(await authorizeVoiceChatPageAccess(null, { kind: "newTopic" })).toEqual({ status: "signup" })
	expect(await authorizeVoiceChatPageAccess("user-1", { kind: "newTopic" })).toEqual({
		status: "allowed",
		userId: "user-1",
	})

	// a chat room the user may not use is a missing one, and a member is allowed even with a spent budget
	const roomPage = { kind: "room", topicId: "topic-1", teamId: "team-1" } as const
	const loadChatRoomSpy = spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	expect(await authorizeVoiceChatPageAccess("user-1", roomPage)).toEqual({ status: "notFound" })
	loadChatRoomSpy.mockResolvedValue({ topic: null, teamId: "team-1" })
	expect(await authorizeVoiceChatPageAccess("user-1", roomPage)).toEqual({ status: "allowed", userId: "user-1" })

	// no page ran a chat turn gate or the monthly spend gate
	expect(isMonthlySpendExhaustedSpy).not.toHaveBeenCalled()
	for (const chatTurnGateSpy of chatTurnGateSpies) {
		expect(chatTurnGateSpy).not.toHaveBeenCalled()
	}
})
