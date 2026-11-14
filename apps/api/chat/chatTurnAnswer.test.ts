// a private chat turn's reservation: a turn is rejected before any model call once the spend and open reservations
// reach the budget, a reply that never starts releases its reservation, and a streamed reply takes the reservation
// along. a turn with a file that was not read responds with why before anything is reserved. a new-topic draft keeps
// a team only if the user leads it, under the team's saved name
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as litellm from "@carlnotes/models/litellm"
import * as spendReservations from "@carlnotes/models/spendReservations"
import { stubReservedUserSpend } from "@carlnotes/models/spendReservationTestFixtures"
import { AttachmentValidationError } from "@carlnotes/pipeline/attachContentType"
import * as attachExtraction from "@carlnotes/pipeline/attachExtraction"
import * as chat from "@carlnotes/pipeline/chat/index"
import * as analytics from "@carlnotes/server/analytics"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { toLeaderTeam } from "./chatTurnAnswer"
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

// post a question to topic-1's chat as user-1, with the attachments given
async function postTopicChatTurn(question: string, attachments: unknown[] = []): Promise<Response> {
	return toSignedInApp(privateChatRoute, "user-1").request(
		"/topics/topic-1/chat",
		toJsonRequest({ question, attachments }),
	)
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

// a PDF as a chat turn sends it. the read of its text is stubbed, so its bytes are never parsed
const PDF_ATTACHMENT = { kind: "pdf", name: "paper.pdf", dataUrl: "data:application/pdf;base64,AA", keep: false }

// each way the read of a file's text fails, with the status, the error, and the retry time its chat turn responds with.
// a file whose read ran past its deadline or the memory limit is too large to read, a file that waited behind other
// files until its deadline is busy, and a file that cannot be parsed is unreadable
const UNREAD_FILE_RESPONSES = [
	{
		unreadFile: "a file too large to read in time",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("time"),
		status: 413,
		error: "attachment too large",
		retryAfter: null,
	},
	{
		unreadFile: "a file whose read passes the memory limit",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("memory"),
		status: 413,
		error: "attachment too large",
		retryAfter: null,
	},
	{
		unreadFile: "a file that waited behind other files, with a time to send it again",
		extractionError: new attachExtraction.AttachmentExtractionLimitError("wait"),
		status: 503,
		error: "attachment busy",
		retryAfter: "30",
	},
	{
		unreadFile: "a file that cannot be read",
		extractionError: new AttachmentValidationError("the file is not a PDF"),
		status: 422,
		error: "attachment unreadable",
		retryAfter: null,
	},
]

test.each(UNREAD_FILE_RESPONSES)(
	"a chat turn responds $status with $error for $unreadFile",
	async ({ extractionError, status, error, retryAfter }) => {
		// the read of the PDF's text fails, with the console and the error report quiet
		quietErrorReports()
		spyOn(attachExtraction, "extractChatAttachmentText").mockRejectedValue(extractionError)
		const reserveUserSpendSpy = spyOn(spendReservations, "reserveUserSpend")
		const streamChatReplySpy = spyOn(chat, "streamChatReply")

		// the turn is rejected with the file's status, error, and retry time
		const response = await postTopicChatTurn("what does this paper say?", [PDF_ATTACHMENT])
		expect(response.status).toBe(status)
		expect(await response.json()).toEqual({ error })
		expect(response.headers.get("Retry-After")).toBe(retryAfter)

		// nothing was reserved or sent to a model
		expect(reserveUserSpendSpy).not.toHaveBeenCalled()
		expect(streamChatReplySpy).not.toHaveBeenCalled()
	},
)

test("a draft team keeps the name the user leads it by, and a team the user does not lead is dropped", () => {
	const leaderTeams = [{ teamId: "team-1", name: "Roasters" }]
	expect(toLeaderTeam({ teamId: "team-1", name: "Personal" }, leaderTeams)).toEqual({
		teamId: "team-1",
		name: "Roasters",
	})
	expect(toLeaderTeam({ teamId: "team-2", name: "Roasters" }, leaderTeams)).toBeNull()
	expect(toLeaderTeam(null, leaderTeams)).toBeNull()
})
