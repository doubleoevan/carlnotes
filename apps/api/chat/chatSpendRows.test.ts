// the spend rows with no text: a transcription and a speech call each write one on their page, and the suggested reply's
// tokens and cost are added to the private chat turn it followed
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableUpdates } from "@carlnotes/db/connectionPoolStub"
import { CHAT_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import * as analytics from "@carlnotes/server/analytics"
import { addChatTurnSpend, recordChatSpendRow } from "./chatSpendRows"
import { toChatTurnRow } from "./chatTurns"

// put the connection pool's own query and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a transcription or a speech call writes the text-less row an unpersisted chat turn does, mapped to the page the
// way a chat turn row and a chat room turn row are, and sends no chat turn event
test("a transcription or a speech call is recorded as a text-less chat turn row on its page", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// one row per page kind, each with its cost as a six-decimal string and its token total
	await recordChatSpendRow({
		kind: "transcription",
		userId: "user-1",
		page: { kind: "topic", topicId: "topic-1" },
		cost: 0.00123456,
		totalTokens: 330,
	})
	await recordChatSpendRow({
		kind: "transcription",
		userId: "user-1",
		page: { kind: "team", teamId: "team-1" },
		cost: 0.002,
		totalTokens: 450,
	})
	await recordChatSpendRow({
		kind: "speech",
		userId: "user-1",
		page: { kind: "newTopic" },
		cost: 0.002,
		totalTokens: 450,
	})
	await recordChatSpendRow({
		kind: "transcription",
		userId: "user-1",
		page: { kind: "room", topicId: "topic-1", teamId: "team-1" },
		cost: 0.002,
		totalTokens: 450,
	})
	await recordChatSpendRow({
		kind: "speech",
		userId: "user-1",
		page: { kind: "room", topicId: null, teamId: "team-1" },
		cost: 0.002,
		totalTokens: 450,
	})

	// every row is a chat_turns insert whose values are, in order, the id, the kind, the user, the topic, the team,
	// the cost, and the tokens, with no text and no room message among them
	expect(sentQueries).toHaveLength(5)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toStartWith('insert into "chat_turns"')
	}

	// the three private pages, each with the row's generated id first
	const rowId = expect.any(String)
	expect(sentQueries[0]?.values).toEqual([rowId, "transcription", "user-1", "topic-1", null, "0.001235", 330])
	expect(sentQueries[1]?.values).toEqual([rowId, "transcription", "user-1", null, "team-1", "0.002000", 450])
	expect(sentQueries[2]?.values).toEqual([rowId, "speech", "user-1", null, null, "0.002000", 450])

	// a topic's chat room names its topic alone, and the team's own chat room names its team, as a chat room turn does
	expect(sentQueries[3]?.values).toEqual([rowId, "transcription", "user-1", "topic-1", null, "0.002000", 450])
	expect(sentQueries[4]?.values).toEqual([rowId, "speech", "user-1", null, "team-1", "0.002000", 450])
	expect(trackEventSpy).not.toHaveBeenCalled()
})

// a 4,000-token topic chat turn's row, as the save writes it
function toReplyRow(): ReturnType<typeof toChatTurnRow> {
	return toChatTurnRow({
		userId: "user-1",
		page: { topicId: "topic-1" },
		totalTokens: 4000,
		searchCount: 0,
		isPersisted: true,
		question: "who is hiring?",
		answer: "four of them are",
		toolCalls: [],
		isSpoken: false,
	})
}

// the suggested reply's tokens and their cost join the saved row, so the row counts the reply and the suggestion
test("a suggested reply's spend is added to the saved row", async () => {
	// a 4,000-token reply's row, and the update the suggestion's 300 tokens send
	const sentQueries = stubConnectionPool(() => [])
	const replyRow = toReplyRow()
	await addChatTurnSpend("turn-1", 300)
	const [update] = toTableUpdates(sentQueries, "chat_turns")

	// the update adds to both columns of that one row, a null token total counted as zero
	expect(update?.text).toContain('"cost" = "chat_turns"."cost" + $1')
	expect(update?.text).toContain('"total_tokens" = coalesce("chat_turns"."total_tokens", 0) + $2')
	expect(update?.values).toEqual([tokenCost(300, CHAT_COST_PER_MILLION_TOKENS).toFixed(6), 300, "turn-1"])

	// the row and the update sum to the turn's whole spend
	const summedCost = Number(replyRow.cost) + Number(update?.values[0])
	expect(Number(replyRow.totalTokens) + Number(update?.values[1])).toBe(4300)
	expect(summedCost).toBeCloseTo(tokenCost(4300, CHAT_COST_PER_MILLION_TOKENS), 6)
})
