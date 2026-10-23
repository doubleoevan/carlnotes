// a private chat turn's reservation: a turn is rejected before any model call once the spend and open reservations
// reach the budget, a reply that never starts releases its reservation, and a streamed reply takes the reservation
// along
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as litellm from "@carlnotes/models/litellm"
import * as spendReservations from "@carlnotes/models/spendReservations"
import { stubReservedUserSpend } from "@carlnotes/models/spendReservationTestFixtures"
import * as chat from "@carlnotes/pipeline/chat/index"
import * as analytics from "@carlnotes/server/analytics"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as chatTurnAuthorization from "./chatTurnAuthorization"
import * as chatTurnStream from "./chatTurnStream"
import { privateChatRoute } from "./privateChat"

// user-1 may chat on topic-1 as a persisted chat turn that may not edit the topic, over a fake Redis
beforeEach(() => {
	stubRedisClient()
	spyOn(chatTurnAuthorization, "authorizeChatTurn").mockResolvedValue({
		status: "allowed",
		userId: "user-1",
		isTopicOwner: false,
		isPersisted: true,
		canEditTopic: false,
	})
})

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// post a question to topic-1's chat as user-1
async function postTopicChatTurn(question: string): Promise<Response> {
	return toSignedInApp(privateChatRoute, "user-1").request("/topics/topic-1/chat", toJsonRequest({ question }))
}

// a user whose spend and open reservations have reached the budget is rejected as a spent budget is, before the key is
// loaded, before any model is called, and with the budget event counted
test("a chat turn is rejected before it posts once the budget is reached", async () => {
	const reserveUserSpendSpy = spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const loadOrProvisionUserLiteLLMKeySpy = spyOn(litellm, "loadOrProvisionUserLiteLLMKey")
	const streamChatReplySpy = spyOn(chat, "streamChatReply")
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the turn is rejected with the spent budget's status
	const response = await postTopicChatTurn("what changed this week?")
	expect(response.status).toBe(402)
	expect(await response.json()).toEqual({ error: "budget exhausted" })

	// the reservation priced the turn, and nothing after it ran
	expect(reserveUserSpendSpy).toHaveBeenCalledWith({
		userId: "user-1",
		kind: "chatTurn",
		maxDollars: expect.any(Number),
	})
	expect(loadOrProvisionUserLiteLLMKeySpy).not.toHaveBeenCalled()
	expect(streamChatReplySpy).not.toHaveBeenCalled()
	expect(trackEventSpy).toHaveBeenCalledWith(
		"chat_budget_reached",
		"user-1",
		expect.objectContaining({ topicId: "topic-1" }),
	)
})

// a reply that fails before it streams releases the reservation, and a streamed reply takes it to the stream, which
// releases it once the turn's spend row is saved
test("a reply that never starts releases its reservation, and a streamed reply takes it along", async () => {
	// every turn reserves, under sk-user
	const { reservation } = stubReservedUserSpend()
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("sk-user")
	spyOn(console, "error").mockImplementation(() => {})

	// a reply whose context read fails releases the reservation before the error reaches the route
	const streamChatReplySpy = spyOn(chat, "streamChatReply").mockRejectedValue(new Error("retrieval failed"))
	expect((await postTopicChatTurn("what changed this week?")).status).toBe(500)
	expect(reservation.release).toHaveBeenCalledTimes(1)

	// a reply that streams hands its reservation to the stream instead of releasing it here
	streamChatReplySpy.mockResolvedValue({} as never)
	const streamChatTurnSpy = spyOn(chatTurnStream, "streamChatTurn").mockReturnValue(new Response("streamed"))
	expect((await postTopicChatTurn("and last week?")).status).toBe(200)
	expect(reservation.release).toHaveBeenCalledTimes(1)
	expect(streamChatTurnSpy.mock.calls[0]?.[1].reservation).toBe(reservation)
})
