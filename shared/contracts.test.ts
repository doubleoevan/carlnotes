// tests for the payload contracts that create and update topic are validated through
import { expect, test } from "bun:test"
import {
	CHAT_HISTORY_ANSWER_CHARS,
	CHAT_HISTORY_TOOL_CALL_INPUT_CHARS,
	CHAT_HISTORY_TOOL_CALLS,
	type ChatToolCall,
	chatRoomMessagePayload,
	chatTurnPayload,
	MAX_ATTACHMENT_CONTEXT_CHARS,
	MAX_TOPIC_SOURCES,
	suggestSourcesPayload,
	TOPIC_SAVE_TOOL_NAMES,
	toSentToolCall,
	toSentToolCalls,
	toStandingTopicEditCall,
	type UpdateTopicPayload,
	updateTopicFieldsPayload,
	updateTopicPayload,
	userInvitePayload,
	withAttachmentNote,
} from "./contracts"

// a valid topic payload, varied only by the source list each test case needs
function topicPayload(sources: UpdateTopicPayload["sources"]): UpdateTopicPayload {
	return {
		name: "A topic",
		prompt: "what to look for",
		tags: [],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday" as const,
		visibility: "private" as const,
		maxTopicFindings: 10,
		inviteEmails: [],
		sources,
	}
}

// a source list of the given length
function sourceList(count: number): UpdateTopicPayload["sources"] {
	return Array.from({ length: count }, (_, index) => ({
		sourceKind: "rss" as const,
		config: { url: `https://example.test/${index}/feed` },
	}))
}

// every Scan fetches every Source, so the list must have a limit
test("a topic holds at most the source limit", () => {
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES))).success).toBe(true)
	expect(updateTopicPayload.safeParse(topicPayload(sourceList(MAX_TOPIC_SOURCES + 1))).success).toBe(false)
})

// the editor merges prompt urls into the same array before it saves, so they must count toward the limit
test("prompt-derived url sources count toward the limit", () => {
	const promptUrls = Array.from({ length: 3 }, (_, index) => ({
		sourceKind: "url" as const,
		config: { url: `https://example.test/page-${index}` },
	}))
	const sources = [...sourceList(MAX_TOPIC_SOURCES - 2), ...promptUrls]
	expect(sources).toHaveLength(MAX_TOPIC_SOURCES + 1)
	expect(updateTopicPayload.safeParse(topicPayload(sources)).success).toBe(false)
})

// a topic with no sources at all is a topic that scans nothing, which the editor allows
test("an empty source list is still a valid payload", () => {
	expect(updateTopicPayload.safeParse(topicPayload([])).success).toBe(true)
})

// a source suggestion request includes every ready attachment's context joined together
test("a suggestion request accepts the attachment context up to the limit and rejects more", () => {
	const request = (attachmentContext: string): Record<string, unknown> => ({
		name: "Raccoons",
		prompt: "care",
		attachmentContext,
		excludeSources: [],
		limit: 3,
	})
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS))).success).toBe(true)
	expect(suggestSourcesPayload.safeParse(request("a".repeat(MAX_ATTACHMENT_CONTEXT_CHARS + 1))).success).toBe(false)

	// a request that names no attachment context at all is still valid
	expect(
		suggestSourcesPayload.safeParse({ name: "Raccoons", prompt: "care", excludeSources: [], limit: 3 }).success,
	).toBe(true)
})

// the shape every user-invite request requires: exactly one identifier, with the email normalized
test("userInvitePayload accepts exactly one identifier and normalizes the email", () => {
	expect(userInvitePayload.safeParse({}).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny", email: "a@b.com" }).success).toBe(false)
	expect(userInvitePayload.safeParse({ username: "penny" }).success).toBe(true)
	const parsedInvite = userInvitePayload.safeParse({ email: "  A@B.COM " })
	expect(parsedInvite.success && parsedInvite.data.email).toBe("a@b.com")
})

// one staged file, the smallest attachment either chat payload accepts
const textAttachment = { kind: "text" as const, name: "notes.txt", text: "hello", keep: false }

// a chat turn or chat room message may be attachments alone, but never nothing at all
test("the chat payloads accept attachments alone and reject an empty send", () => {
	// a question or content may be empty while attachments go with the send
	expect(chatTurnPayload.safeParse({ question: "", attachments: [textAttachment] }).success).toBe(true)
	expect(chatRoomMessagePayload.safeParse({ content: "", attachments: [textAttachment] }).success).toBe(true)

	// a send with nothing at all is rejected by both
	expect(chatTurnPayload.safeParse({ question: "" }).success).toBe(false)
	expect(chatRoomMessagePayload.safeParse({ content: "" }).success).toBe(false)
})

// an attachments-only question reads as the note alone, with no leading blank lines
test("withAttachmentNote stands alone on an empty question", () => {
	expect(withAttachmentNote("", [{ name: "a.pdf" }])).toBe("[attached: a.pdf]")
})

// a partial update where one field alone is enough, and an unknown visibility is still rejected
test("updateTopicFieldsPayload takes a name or a visibility alone and rejects an empty call", () => {
	expect(updateTopicFieldsPayload.safeParse({ name: "Where to hoop" }).success).toBe(true)
	expect(updateTopicFieldsPayload.safeParse({ visibility: "private" }).success).toBe(true)
	expect(updateTopicFieldsPayload.safeParse({ visibility: "secret" }).success).toBe(false)
	expect(updateTopicFieldsPayload.safeParse({}).success).toBe(false)
})

// a tool that returned more than the payload accepts must not reject every later question in that conversation
test("a long tool call output is clipped to what the chat turn payload accepts", () => {
	const longToolCall = {
		toolName: "searchWeb",
		input: { query: "sleep" },
		output: "x".repeat(CHAT_HISTORY_ANSWER_CHARS + 2_000),
	}
	const sentToolCall = toSentToolCall(longToolCall)
	expect(sentToolCall.output.length).toBeLessThanOrEqual(CHAT_HISTORY_ANSWER_CHARS)
	expect(sentToolCall.output.endsWith("\u2026")).toBe(true)
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [sentToolCall] }],
		}).success,
	).toBe(true)

	// the same payload with the raw call is what the validator rejects
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [longToolCall] }],
		}).success,
	).toBe(false)

	// a call already inside the limit is returned untouched
	const shortToolCall = { toolName: "draftTopic", input: {}, output: "The draft now reads: Sourdough" }
	expect(toSentToolCall(shortToolCall)).toBe(shortToolCall)
})

// an input past its own limit rejects the payload just as an output does, and a tool that takes a list of sources
// or a whole prompt can write one
test("a long tool call input is dropped, keeping the output that says what the call did", () => {
	const longInputToolCall = {
		toolName: "draftTopic",
		input: { sources: "x".repeat(CHAT_HISTORY_TOOL_CALL_INPUT_CHARS + 1_000) },
		output: "The draft now reads: Sourdough",
	}
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [longInputToolCall] }],
		}).success,
	).toBe(false)
	const sentToolCall = toSentToolCall(longInputToolCall)
	expect(sentToolCall.input).toBeNull()
	expect(sentToolCall.output).toBe("The draft now reads: Sourdough")
	expect(
		chatTurnPayload.safeParse({
			question: "and now?",
			history: [{ question: "q", answer: "a", toolCalls: [sentToolCall] }],
		}).success,
	).toBe(true)
})

// one turn may call more tools than the payload replays, as a consent that swaps every source does. the whole
// conversation would otherwise reject every later question
test("a turn's tool calls are clipped to the count the payload accepts, newest kept", () => {
	const toolCalls = Array.from({ length: CHAT_HISTORY_TOOL_CALLS + 3 }, (_, index) => ({
		toolName: "addSource",
		input: { value: `r/hoops${index}` },
		output: `Carl added reddit — r/hoops${index}.`,
	}))
	expect(
		chatTurnPayload.safeParse({
			question: "what did you change?",
			history: [{ question: "yes", answer: "Saved.", toolCalls }],
		}).success,
	).toBe(false)
	const sentToolCalls = toSentToolCalls(toolCalls)
	expect(sentToolCalls).toHaveLength(CHAT_HISTORY_TOOL_CALLS)
	expect(sentToolCalls.at(-1)?.output).toBe(`Carl added reddit — r/hoops${CHAT_HISTORY_TOOL_CALLS + 2}.`)
	expect(
		chatTurnPayload.safeParse({
			question: "what did you change?",
			history: [{ question: "yes", answer: "Saved.", toolCalls: sentToolCalls }],
		}).success,
	).toBe(true)
})

// the proposal a yes answers. one already saved is spent, so a later yes to anything else forces no save
test("a topic edit proposal stands until it is cancelled or saved", () => {
	const proposeCall = { toolName: "proposeTopicEdit", input: { tags: ["Testing"] }, output: "Proposed." }
	const toToolCall = (toolName: string): ChatToolCall => ({ toolName, input: {}, output: "" })
	expect(toStandingTopicEditCall([])).toBeNull()
	expect(toStandingTopicEditCall([toToolCall("searchWeb")])).toBeNull()
	expect(toStandingTopicEditCall([proposeCall])).toBe(proposeCall)

	// a search between the two leaves the proposal standing, since it saves nothing
	expect(toStandingTopicEditCall([proposeCall, toToolCall("searchWeb")])).toBe(proposeCall)
	expect(toStandingTopicEditCall([proposeCall, toToolCall("cancelTopicEdit")])).toBeNull()
	for (const savingToolName of TOPIC_SAVE_TOOL_NAMES) {
		expect(toStandingTopicEditCall([proposeCall, toToolCall(savingToolName)])).toBeNull()
	}

	// a proposal made after a save is standing again
	expect(toStandingTopicEditCall([proposeCall, toToolCall("addSource"), proposeCall])).toBe(proposeCall)
})
