// chat turn row tests: what a chat turn costs, which chat turns keep their text, how their tool calls go into the row,
// how a transcription or a speech call is recorded as spend, and how the spoken flag is stored and replayed
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "@carlnotes/models/budget"
import * as analytics from "@carlnotes/server/analytics"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import * as authorization from "../authorization"
import * as chatAttachmentReads from "./chatAttachmentReads"
import {
	loadChatTurns,
	recordChatSpendRow,
	saveChatTurn,
	type ToChatTurnRowOptions,
	toChatKind,
	toChatTurnRow,
} from "./chatTurns"
import { decryptChatJson, decryptChatText, encryptChatText } from "./encryption"
import * as linkPreviews from "./linkPreviews"

// put the connection pool's own query and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a stored column's decrypted text
function toDecryptedText(storedText: string | null | undefined): string | null {
	return storedText ? decryptChatText(storedText) : null
}

// a topic chat turn's options, persisted with a question and an answer unless the case says otherwise
function toTopicChatTurnOptions(chatTurnRowOptions: Partial<ToChatTurnRowOptions>): ToChatTurnRowOptions {
	return {
		userId: "user-1",
		page: { topicId: "topic-1" },
		totalTokens: 1000,
		searchCount: 0,
		isPersisted: true,
		question: "who is hiring?",
		answer: "four of them are",
		toolCalls: [],
		isSpoken: false,
		...chatTurnRowOptions,
	}
}

// a topic chat turn's row, built from its options
function toTopicChatTurnRow(chatTurnRowOptions: Partial<ToChatTurnRowOptions>): ReturnType<typeof toChatTurnRow> {
	return toChatTurnRow(toTopicChatTurnOptions(chatTurnRowOptions))
}

// a persisted chat turn stores what was said, so a signed-in user can reload the page and find their conversation
test("a persisted chat turn keeps its question and answer", () => {
	const chatTurnRow = toTopicChatTurnRow({})
	expect(toDecryptedText(chatTurnRow.question)).toBe("who is hiring?")
	expect(toDecryptedText(chatTurnRow.answer)).toBe("four of them are")
	expect(chatTurnRow.userId).toBe("user-1")
})

// a chat turn that does not get persisted still writes a row for the spend to reach the monthly meter
test("a chat turn that does not persist records its cost with no text", () => {
	const chatTurnRow = toTopicChatTurnRow({ isPersisted: false })
	expect(chatTurnRow.question).toBeNull()
	expect(chatTurnRow.answer).toBeNull()
	expect(Number(chatTurnRow.cost)).toBeGreaterThan(0)
})

// the cost is the chat rate applied to the token total, through the same tokenCost that a scan uses
test("a chat turn's cost is the chat rate applied to its tokens", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 1_000_000, isPersisted: false })
	expect(Number(chatTurnRow.cost)).toBeCloseTo(tokenCost(1_000_000, CHAT_COST_PER_MILLION_TOKENS), 6)
})

// a chat turn's row saves its token total beside the cost, as a chat room turn's row does
test("a chat turn's row records its token total", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 1234, isPersisted: false })
	expect(chatTurnRow.totalTokens).toBe(1234)
})

// a web-enabled chat turn's searches are billed onto the same row, so the monthly meter adds what Exa cost
test("a chat turn's web searches add their cost to the row", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 0, searchCount: 2, isPersisted: false })
	expect(Number(chatTurnRow.cost)).toBeCloseTo(2 * EXA_COST_PER_SEARCH, 6)
})

// a chat turn that streamed and then failed still spent tokens, so a zero-token chat turn is the only free one
test("a zero-token chat turn with no searches costs nothing", () => {
	const chatTurnRow = toTopicChatTurnRow({ totalTokens: 0, isPersisted: false, answer: "" })
	expect(Number(chatTurnRow.cost)).toBe(0)
})

// a chat turn stores its tool calls as json that the next chat turn replays, and stores none if it called none
test("a chat turn's tool calls are stored with its text and left out when there are none", () => {
	const toolCalls = [{ toolName: "draftTopic", input: { name: "Hoops" }, output: "The draft now reads: Hoops" }]
	const chatTurnRowWithToolCalls = toTopicChatTurnRow({ question: "add reddit", answer: "Saved.", toolCalls })
	expect(decryptChatJson(chatTurnRowWithToolCalls.toolCalls ?? null)).toEqual(toolCalls)
	const chatTurnRowWithoutToolCalls = toTopicChatTurnRow({ question: "hello", answer: "Hi." })
	expect(chatTurnRowWithoutToolCalls.toolCalls).toBeNull()
	// expect no tool calls on a chat turn that the gate does not persist either
	const unpersistedChatTurnRow = toTopicChatTurnRow({
		isPersisted: false,
		question: "add reddit",
		answer: "Saved.",
		toolCalls,
	})
	expect(unpersistedChatTurnRow.toolCalls).toBeNull()
})

// a private chat turn's row is private and names no podcast episode, and a podcast chat turn's row names its podcast
// episode, its chapter, and who answered, carl if no speaker came
test("a chat turn's row names its kind and a podcast chat turn's its podcast episode, chapter, and speaker", () => {
	const privateChatTurnRow = toTopicChatTurnRow({})
	expect(privateChatTurnRow).toMatchObject({
		kind: "private",
		podcastEpisodeId: null,
		chapterPosition: null,
		podcastAnswerSpeaker: null,
	})
	const podcastEpisodeChapter = { podcastEpisodeId: "episode-1", chapterPosition: 2 }
	expect(toTopicChatTurnRow({ podcastEpisodeChapter, podcastAnswerSpeaker: "cohost", isSpoken: true })).toMatchObject({
		kind: "podcast",
		topicId: "topic-1",
		teamId: null,
		podcastEpisodeId: "episode-1",
		chapterPosition: 2,
		podcastAnswerSpeaker: "cohost",
	})
	expect(toTopicChatTurnRow({ podcastEpisodeChapter }).podcastAnswerSpeaker).toBe("host")
})

// a saved chat turn is counted once, and its event says whether the question was spoken, its kind, and for a podcast
// chat turn who answered it
test("saveChatTurn counts the chat turn with whether it was spoken", async () => {
	stubConnectionPool(() => [["turn-1"]])
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const analyticsProperties = TEST_ANALYTICS_PROPERTIES

	// a spoken chat turn on a topic page
	const savedChatTurnId = await saveChatTurn({ ...toTopicChatTurnOptions({ isSpoken: true }), analyticsProperties })
	expect(savedChatTurnId).toBe("turn-1")
	expect(trackEventSpy).toHaveBeenCalledTimes(1)
	expect(trackEventSpy).toHaveBeenCalledWith("chat_turn_sent", "user-1", {
		...analyticsProperties,
		topicId: "topic-1",
		chatKind: "topic",
		chatTurnKind: "private",
		isSpoken: true,
	})

	// a podcast chat turn that vienna answered
	await saveChatTurn({
		...toTopicChatTurnOptions({
			question: "why does this matter?",
			answer: "because you asked",
			isSpoken: true,
			podcastEpisodeChapter: { podcastEpisodeId: "episode-1", chapterPosition: 0 },
			podcastAnswerSpeaker: "cohost",
		}),
		analyticsProperties,
	})
	expect(trackEventSpy).toHaveBeenLastCalledWith("chat_turn_sent", "user-1", {
		...analyticsProperties,
		topicId: "topic-1",
		chatKind: "topic",
		chatTurnKind: "podcast",
		speaker: "cohost",
		isSpoken: true,
	})
})

// a spoken chat turn's row keeps the flag, and a typed one stores false
test("a chat turn's row stores whether its question was spoken", () => {
	expect(toTopicChatTurnRow({ isSpoken: true }).isSpoken).toBe(true)
	expect(toTopicChatTurnRow({}).isSpoken).toBe(false)
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

// a stored conversation replays each chat turn's spoken flag and reads only the rows that kept their text
test("loadChatTurns replays whether each chat turn was spoken and reads only the rows with text", async () => {
	// a user whose chat text the gate keeps, with no attachments and no link previews
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(chatAttachmentReads, "loadTopicChatTurnAttachments").mockResolvedValue(new Map())
	spyOn(linkPreviews, "loadChatLinkPreviews").mockResolvedValue(new Map())

	// two stored chat turns, newest first as the read orders them: a typed one, and a spoken one vienna answered from
	// the podcast player
	const sentQueries = stubConnectionPool(() => [
		[
			"ct-2",
			encryptChatText("and now?"),
			encryptChatText("Still four."),
			null,
			false,
			null,
			null,
			null,
			"2026-10-16T12:01:00.000Z",
		],
		[
			"ct-1",
			encryptChatText("who is hiring?"),
			encryptChatText("Four of them."),
			null,
			true,
			"episode-1",
			2,
			"cohost",
			"2026-10-16T12:00:00.000Z",
		],
	])
	const chatTurns = await loadChatTurns("user-1", { topicId: "topic-1" })
	expect(chatTurns.map((chatTurn) => [chatTurn.question, chatTurn.isSpoken])).toEqual([
		["who is hiring?", true],
		["and now?", false],
	])

	// the podcast chat turn replays its speaker and its chapter, and the typed chat turn is carl's with no chapter
	expect(chatTurns.map((chatTurn) => [chatTurn.speaker, chatTurn.podcastEpisodeChapter])).toEqual([
		["cohost", { podcastEpisodeId: "episode-1", chapterPosition: 2 }],
		["host", null],
	])

	// the read keeps a topic's private and podcast chat turns by their kind, and leaves out a cleared turn's row with no
	// text
	expect(sentQueries[0]?.text).toContain('"chat_turns"."kind" in (')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["private", "podcast"]))
	expect(sentQueries[0]?.values).not.toContain("chat_room")
	expect(sentQueries[0]?.text).toContain('"chat_turns"."question" is not null')
	expect(sentQueries[0]?.text).toContain('"chat_turns"."answer" is not null')
})

// a team's and the new-topic chat's conversation read their private chat turns alone, never a chat room turn or a
// spend row
test("loadChatTurns reads a team's or the new-topic chat's private chat turns by kind", async () => {
	// a user whose chat text is kept, with no link previews and no stored rows
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	spyOn(linkPreviews, "loadChatLinkPreviews").mockResolvedValue(new Map())
	const sentQueries = stubConnectionPool(() => [])

	// load both conversations, and expect each query to filter on the private kind
	await loadChatTurns("user-1", { teamId: "team-1" })
	await loadChatTurns("user-1", { newTopic: true })
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain('"chat_turns"."kind" = $')
		expect(sentQuery.values).toContain("private")
	}
})

// an analytics event names which chat a page holds, for a private page and for a voice page alike
test("toChatKind names the chat a private page or a voice page holds", () => {
	expect(toChatKind({ topicId: "topic-1" })).toBe("topic")
	expect(toChatKind({ teamId: "team-1" })).toBe("team")
	expect(toChatKind({ newTopic: true })).toBe("new_topic")
	expect(toChatKind({ kind: "topic", topicId: "topic-1" })).toBe("topic")
	expect(toChatKind({ kind: "newTopic" })).toBe("new_topic")
	expect(toChatKind({ kind: "room", topicId: null, teamId: "team-1" })).toBe("room")
})
