// a streamed chat turn's suggested reply: the saved line follows the save and the proposal, the suggestion follows it,
// its spend joins the saved row before the reservation is released, and a turn that may not have one gets no call
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { ChatReplyLine } from "@carlnotes/contracts/chatTurns"
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import * as spendReservations from "@carlnotes/models/spendReservations"
import type { ChatReplyStream } from "@carlnotes/pipeline/chat/index"
import { PODCAST_EPISODE_CHAPTER } from "@carlnotes/pipeline/chat/podcastEpisodeChapterTestFixtures"
import * as suggestedReplyModule from "@carlnotes/pipeline/chat/suggestedReply"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { Hono } from "hono"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { toEmptyChatTurnToolCalls } from "../tool/chatTools"
import * as chatProposals from "./chatProposals"
import * as chatSpendRows from "./chatSpendRows"
import { type StreamedChatTurn, streamChatTurn } from "./chatTurnStream"
import * as chatTurns from "./chatTurns"

// the rollout setting, put back after each test
const restoreEnvSettings = saveEnvSettings(["SUGGESTED_REPLY_CHATS"])

// the steps the stream took, in order
let steps: string[] = []

// spy on the save, the proposal's record, the call, its reservation, and the spend's add, each logging its step
beforeEach(() => {
	// no steps yet, with the setting unset
	steps = []
	delete Bun.env.SUGGESTED_REPLY_CHATS
	spyOn(chatTurns, "saveChatTurn").mockImplementation(async () => {
		steps.push("saved")
		return "turn-1"
	})
	// the proposal's record, the spend's add, and the call
	spyOn(chatProposals, "recordChatProposal").mockImplementation(async () => {
		steps.push("proposal recorded")
	})
	spyOn(chatSpendRows, "addChatTurnSpend").mockImplementation(async (_chatTurnId, totalTokens) => {
		steps.push(`spend added ${totalTokens}`)
	})
	// the suggestion's own reservation, granted unless a test says
	spyOn(spendReservations, "reserveUserSpend").mockImplementation(async () => {
		steps.push("suggestion reserved")
		return { release: async () => void steps.push("suggestion released") }
	})
	stubSuggestion({ suggestedReply: "Weekly is fine", totalTokens: 300 })
})

// put back the setting and every spy
afterEach(() => {
	restoreEnvSettings()
	mock.restore()
})

// make the call return the given result, logging its step
function stubSuggestion(
	result: suggestedReplyModule.SuggestedReplyResult,
): ReturnType<typeof spyOn<typeof suggestedReplyModule, "writeSuggestedReply">> {
	return spyOn(suggestedReplyModule, "writeSuggestedReply").mockImplementation(async () => {
		steps.push("suggestion")
		return result
	})
}

// a new-topic chat turn whose reply asks one question and calls the given tools, or the reply that throws
function toStreamedChatTurn(
	overrides: Partial<StreamedChatTurn> = {},
	{ chatToolCalls = [], isBroken = false }: { chatToolCalls?: ChatToolCall[]; isBroken?: boolean } = {},
): StreamedChatTurn {
	// the reply's one text part, or a break before it
	async function* replyParts(): AsyncGenerator<{ type: "text"; text: string }> {
		if (isBroken) {
			throw new Error("the model stream broke")
		}
		yield { type: "text", text: "How often should I look?" }
	}
	const chatReply: ChatReplyStream = {
		replyParts: replyParts(),
		completion: Promise.resolve({
			text: "How often should I look?",
			totalTokens: 4000,
			searchCount: 0,
			toolCalls: chatToolCalls,
		}),
	}
	// who asked what on the new-topic chat, typed and kept
	return {
		loadedChatReply: Promise.resolve({ chatReply, agreementTokens: 0 }),
		userId: "user-1",
		page: { newTopic: true },
		question: "espresso machines",
		attachments: [],
		isPersisted: true,
		isSpoken: false,
		toolCalls: toEmptyChatTurnToolCalls(),
		analyticsProperties: TEST_ANALYTICS_PROPERTIES,
		litellmApiKey: "sk-user",
		// the turn before this one, and the reservation that logs its release
		recentChatTurns: [{ question: "hi", answer: "What should I watch for you?" }],
		reservation: {
			release: async () => {
				steps.push("turn released")
			},
		},
		...overrides,
	}
}

// stream one chat turn to its end and return the lines it wrote
async function streamLines(streamedChatTurn: StreamedChatTurn): Promise<ChatReplyLine[]> {
	const app = new Hono().post("/", (context) => streamChatTurn(context, streamedChatTurn))
	const responseText = await (await app.request("/", { method: "POST" })).text()
	return responseText
		.split("\n")
		.filter((lineText) => lineText !== "")
		.map((lineText) => JSON.parse(lineText) as ChatReplyLine)
}

// a proposal of the new topic, standing over the given draft
function toProposedNewTopicTurn(topicDraft: TopicDraft): StreamedChatTurn {
	return toStreamedChatTurn(
		{ topicDraft },
		{ chatToolCalls: [{ toolName: "proposeNewTopic", input: {}, output: "proposed" }] },
	)
}

test("the saved line follows the save and the proposal, and the suggestion follows it", async () => {
	const writeSuggestedReply = stubSuggestion({ suggestedReply: "Weekly is fine", totalTokens: 300 })
	const lines = await streamLines(toProposedNewTopicTurn({ ...EMPTY_TOPIC_DRAFT, name: "Espresso" }))

	// the lines in order, the steps in order, and the spend added before the release
	expect(lines.map((line) => line.type)).toEqual(["text", "saved", "suggestedReply"])
	expect(lines[2]).toEqual({ type: "suggestedReply", suggestedReply: "Weekly is fine" })
	expect(steps).toEqual([
		"saved",
		"proposal recorded",
		"turn released",
		"suggestion reserved",
		"suggestion",
		"spend added 300",
		"suggestion released",
	])

	// the call read the turn before this one, this one, and the draft
	const [writeSuggestedReplyOptions] = writeSuggestedReply.mock.calls[0] ?? []
	expect(writeSuggestedReplyOptions?.chatTurns).toEqual([
		{ question: "hi", answer: "What should I watch for you?" },
		{ question: "espresso machines", answer: "How often should I look?" },
	])
	expect(writeSuggestedReplyOptions?.topicDraft?.name).toBe("Espresso")
})

test("no suggestion writes no line but still adds the tokens it spent", async () => {
	stubSuggestion({ suggestedReply: null, totalTokens: 250 })
	const lines = await streamLines(toStreamedChatTurn())
	expect(lines.map((line) => line.type)).toEqual(["text", "saved"])
	expect(steps).toEqual([
		"saved",
		"proposal recorded",
		"turn released",
		"suggestion reserved",
		"suggestion",
		"spend added 250",
		"suggestion released",
	])
})

test("a spent budget writes no line and adds no spend", async () => {
	stubSuggestion({ suggestedReply: null, totalTokens: 0 })
	const lines = await streamLines(toStreamedChatTurn())
	expect(lines.map((line) => line.type)).toEqual(["text", "saved"])
	expect(steps).toEqual([
		"saved",
		"proposal recorded",
		"turn released",
		"suggestion reserved",
		"suggestion",
		"suggestion released",
	])
})

test("a budget with no room for the suggestion makes no call", async () => {
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const lines = await streamLines(toStreamedChatTurn())
	expect(lines.map((line) => line.type)).toEqual(["text", "saved"])
	expect(steps).toEqual(["saved", "proposal recorded", "turn released"])
})

test("a failed spend add is reported and the reservation is still released", async () => {
	// the add fails, and the report is caught
	spyOn(chatSpendRows, "addChatTurnSpend").mockRejectedValue(new Error("the database is gone"))
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const lines = await streamLines(toStreamedChatTurn())
	expect(lines.map((line) => line.type)).toEqual(["text", "saved", "suggestedReply"])
	expect(steps).toEqual([
		"saved",
		"proposal recorded",
		"turn released",
		"suggestion reserved",
		"suggestion",
		"suggestion released",
	])
	expect(reportError).toHaveBeenCalledTimes(1)
})

test("a broken reply writes no saved line and makes no call", async () => {
	spyOn(monitoring, "reportError").mockImplementation(() => {})
	const lines = await streamLines(toStreamedChatTurn({}, { isBroken: true }))
	expect(lines.map((line) => line.type)).toEqual(["failed"])
	expect(steps).toEqual(["saved", "turn released"])
})

test("a spoken, podcast, or created turn gets the saved line and no call", async () => {
	// a created turn
	const createdToolCalls = { ...toEmptyChatTurnToolCalls(), createdTopicId: "topic-9" }
	for (const streamedChatTurn of [
		toStreamedChatTurn({ isSpoken: true }),
		toStreamedChatTurn({ page: { topicId: "topic-1" }, podcastEpisodeChapter: PODCAST_EPISODE_CHAPTER }),
		toStreamedChatTurn({ toolCalls: createdToolCalls }),
	]) {
		steps = []
		const lineTypes = (await streamLines(streamedChatTurn)).map((line) => line.type)
		expect(lineTypes.at(-1)).toBe("saved")
		expect(lineTypes).not.toContain("suggestedReply")
		expect(steps).not.toContain("suggestion")
	}
})

test("every proposal gets the call: public, with invites, and on a team", async () => {
	const team = { teamId: "team-1", name: "Quiet Coffee Club" }
	for (const topicDraft of [
		{ ...EMPTY_TOPIC_DRAFT, name: "Espresso", visibility: "public" as const, team },
		{ ...EMPTY_TOPIC_DRAFT, name: "Espresso", visibility: "invite" as const, inviteEmails: ["sam@example.com"], team },
		{ ...EMPTY_TOPIC_DRAFT, name: "Espresso" },
	]) {
		steps = []
		await streamLines(toProposedNewTopicTurn(topicDraft))
		expect(steps).toContain("suggestion")
	}
})

test("the setting decides which private chats make the call", async () => {
	// unset turns on a Topic's, a team's, and a Topic Post's private chat
	const privateChatTurns: Partial<StreamedChatTurn>[] = [
		{ page: { topicId: "topic-1" } },
		{ page: { teamId: "team-1" } },
		{ page: { topicId: "topic-1" }, topicPostId: "post-1" },
	]
	for (const privateChatTurn of privateChatTurns) {
		steps = []
		await streamLines(toStreamedChatTurn(privateChatTurn))
		expect(steps).toContain("suggestion")
	}

	// new-topic leaves them off and keeps the new-topic chat, and off turns every chat off
	Bun.env.SUGGESTED_REPLY_CHATS = "new-topic"
	for (const privateChatTurn of privateChatTurns) {
		steps = []
		await streamLines(toStreamedChatTurn(privateChatTurn))
		expect(steps).not.toContain("suggestion")
	}
	// while the new-topic chat keeps its call
	steps = []
	await streamLines(toStreamedChatTurn())
	expect(steps).toContain("suggestion")
	// off turns the new-topic chat off too
	Bun.env.SUGGESTED_REPLY_CHATS = "off"
	steps = []
	await streamLines(toStreamedChatTurn())
	expect(steps).not.toContain("suggestion")
})

test("the saved line waits until the proposal is recorded", async () => {
	// a record that waits until the test lets it finish
	let finishRecord = (): void => {}
	spyOn(chatProposals, "recordChatProposal").mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finishRecord = resolve
			}),
	)
	// the stream's reader
	const app = new Hono().post("/", (context) => streamChatTurn(context, toStreamedChatTurn()))
	const reader = (await app.request("/", { method: "POST" })).body?.getReader()
	if (!reader) {
		throw new Error("the stream has no body")
	}

	// read up to the reply's text, then see that nothing more arrives while the record waits
	const textDecoder = new TextDecoder()
	let receivedText = ""
	while (!receivedText.includes('"text"')) {
		receivedText += textDecoder.decode((await reader.read()).value)
	}
	// the next read waits while the record does
	const nextRead = reader.read()
	const raced = await Promise.race([nextRead.then(() => "line"), Bun.sleep(50).then(() => "waiting")])
	expect(raced).toBe("waiting")
	expect(receivedText).not.toContain('{"type":"saved"}')

	// once the record finishes, the saved line arrives
	finishRecord()
	receivedText += textDecoder.decode((await nextRead).value)
	while (!receivedText.includes('{"type":"saved"}')) {
		receivedText += textDecoder.decode((await reader.read()).value)
	}
	expect(receivedText).toContain('{"type":"saved"}')

	// the turn's reservation is gone by then, so a quick next question is never held back by it
	expect(steps).toContain("turn released")
})
