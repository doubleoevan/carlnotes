// chat message tests: the history compaction, the attachments in the newest message, the replayed tool calls,
// and the consent step that forces a save
import { expect, test } from "bun:test"
import {
	CHAT_HISTORY_TURNS,
	CHAT_MEMORY_CHARS,
	TOPIC_SAVE_TOOL_NAMES,
	toUncompactedChatTurnStart,
} from "@shared/contracts"
import type { ChatToolCall } from "@shared/payloads"
import { type ChatHistoryTurn, isConsent, toConsentStep, toModelMessages } from "./chatMessages"

// a history of numbered chat turns with long answers, for the compaction cases to slice
function longHistory(count: number): { question: string; answer: string }[] {
	return Array.from({ length: count }, (_, index) => ({
		question: `question ${index}`,
		answer: `answer ${index} ${"x".repeat(500)}`,
	}))
}

// the newest window shows the chat uncompacted while older answers arrive trimmed with a visible cut
test("older answers compact while the recent window stays uncompacted", () => {
	const history = longHistory(CHAT_HISTORY_TURNS)
	const messages = toModelMessages(history, "latest question")

	// every chat turn has two messages: the question and the answer, followed by the latest question
	expect(messages).toHaveLength(CHAT_HISTORY_TURNS * 2 + 1)
	expect(messages.at(-1)).toEqual({ role: "user", content: "latest question" })

	// the oldest answer is clipped with an ellipsis and the newest is untouched, while questions stay whole
	expect(String(messages[1]?.content).endsWith("…")).toBe(true)
	expect(String(messages[1]?.content).length).toBeLessThan(500)
	expect(messages[0]?.content).toBe("question 0")
	expect(messages.at(-2)?.content).toBe(history.at(-1)?.answer)
})

// the boundary is a character budget, so a fixed chat turn size simplifies the arithmetic
test("the uncompacted window boundary follows the character budget", () => {
	// each chat turn weighs exactly one tenth of the budget, so ten fit and the eleventh overdraws
	const answerChars = CHAT_MEMORY_CHARS / 10
	const history = Array.from({ length: 20 }, () => ({ question: "", answer: "x".repeat(answerChars) }))

	// the window starts at index ten, keeping the newest ten chat turns word for word
	const boundary = toUncompactedChatTurnStart(history)
	expect(boundary).toBe(10)

	// the last compacted answer sits just before the window and the first uncompacted one just inside it
	const messages = toModelMessages(history, "latest")
	expect(String(messages[boundary * 2 - 1]?.content).endsWith("…")).toBe(true)
	expect(String(messages[boundary * 2 + 1]?.content).endsWith("…")).toBe(false)
})

// a verbose conversation compacts sooner than a terse one because we budget by characters instead of chat turns
test("terse chat turns keep a wider uncompacted window than verbose ones", () => {
	const terseChat = Array.from({ length: 60 }, () => ({ question: "q", answer: "short answer" }))
	const verboseChat = Array.from({ length: 60 }, () => ({ question: "q", answer: "x".repeat(6000) }))
	expect(toUncompactedChatTurnStart(terseChat)).toBe(0)
	expect(toUncompactedChatTurnStart(verboseChat)).toBeGreaterThan(40)
})

// the newest chat turn always returns uncompacted, even one that is bigger than the whole budget
test("the newest chat turn is always uncompacted", () => {
	expect(toUncompactedChatTurnStart([{ question: "q", answer: "x".repeat(CHAT_MEMORY_CHARS * 2) }])).toBe(0)
	expect(toUncompactedChatTurnStart([])).toBe(0)
})

// anything past the history bound is dropped outright, so an oversized history cannot inflate the bill
test("history past the bound is dropped", () => {
	const messages = toModelMessages(longHistory(CHAT_HISTORY_TURNS + 10), "latest")
	expect(messages).toHaveLength(CHAT_HISTORY_TURNS * 2 + 1)
	expect(messages[0]?.content).toBe("question 10")
})

// attachments are only included in the newest message: text folds under the question and each image is its own part
test("attachments fold into the newest message as parts", () => {
	const messages = toModelMessages([{ question: "earlier", answer: "reply" }], "what is this?", [
		{ kind: "text", name: "notes.md", text: "the notes", keep: false },
		{ kind: "image", name: "shot.png", dataUrl: "data:image/png;base64,AAA", keep: false },
	])

	// history stays plain strings while the newest message becomes parts
	expect(messages[0]?.content).toBe("earlier")
	const content = messages.at(-1)?.content
	expect(Array.isArray(content)).toBe(true)
	const parts = content as { type: string; text?: string; image?: string }[]
	expect(parts[0]).toEqual({ type: "text", text: "what is this?\n\n--- attached: notes.md ---\nthe notes" })
	expect(parts[1]).toEqual({ type: "image", image: "data:image/png;base64,AAA" })
})

// a consent answers a proposal, and a question with more in it does not
test("isConsent reads a consent and nothing longer", () => {
	expect(isConsent("yes")).toBe(true)
	expect(isConsent("  Yes! ")).toBe(true)
	expect(isConsent("go for it.")).toBe(true)
	expect(isConsent("lets do it")).toBe(true)
	expect(isConsent("Sure thing!")).toBe(true)
	// a yes with more in it is a question
	expect(isConsent("yes, but drop the second source")).toBe(false)
	expect(isConsent("what is a brew?")).toBe(false)
})

// a chat turn that called a tool replays the call and its result
test("the history replays a chat turn's tool calls as calls and results", () => {
	const modelMessages = toModelMessages(
		[
			{
				question: "add reddit r/hoops",
				answer: "Saved.",
				toolCalls: [
					{
						toolName: "draftTopic",
						input: { sources: [{ sourceOption: "reddit", value: "r/hoops" }] },
						output: "The draft now reads: ...",
					},
				],
			},
		],
		"and set it to weekly",
	)
	expect(modelMessages.map((modelMessage) => modelMessage.role)).toEqual([
		"user",
		"assistant",
		"tool",
		"assistant",
		"user",
	])
	const toolModelMessage = modelMessages[2]
	expect(JSON.stringify(toolModelMessage)).toContain("The draft now reads")
	expect(JSON.stringify(modelMessages[1])).toContain("draftTopic")
})

// a chat turn that called no tool is one assistant message
test("the history leaves a chat turn that called no tool as one answer", () => {
	const modelMessages = toModelMessages([{ question: "what is this", answer: "A topic." }], "thanks")
	expect(modelMessages.map((modelMessage) => modelMessage.role)).toEqual(["user", "assistant", "user"])
})

// a yes must be answered by a tool that saves, never by a search or by a tool that only shows the topic
test("toConsentStep forces the first step to pick from the tools that save", () => {
	const savingTools = { updateTopicPrompt: {}, addSource: {} } as never
	expect(toConsentStep(0, { question: "yes", history: proposedHistory() }, savingTools)).toEqual({
		toolChoice: "required",
		activeTools: ["updateTopicPrompt", "addSource"],
	})
})

// a later step, and a chat turn that is not a consent, stay unrestricted
test("toConsentStep leaves a later step and a question that is not a consent alone", () => {
	const savingTools = { updateTopicPrompt: {} } as never
	expect(toConsentStep(1, { question: "yes", history: proposedHistory() }, savingTools)).toBeUndefined()
	expect(toConsentStep(0, { question: "what is a brew?", history: proposedHistory() }, savingTools)).toBeUndefined()
	expect(toConsentStep(0, { question: "yes", history: proposedHistory() }, undefined)).toBeUndefined()
	expect(toConsentStep(0, { question: "yes", history: proposedHistory() }, {} as never)).toBeUndefined()
})

// a yes that answers no proposal must never force a save the user did not ask for
test("toConsentStep leaves a yes alone when carl proposed nothing", () => {
	const savingTools = { updateTopicPrompt: {} } as never
	expect(toConsentStep(0, { question: "yes", history: [] }, savingTools)).toBeUndefined()
	expect(
		toConsentStep(
			0,
			{ question: "yes", history: [{ question: "go on", answer: "Sure.", toolCalls: [] }] },
			savingTools,
		),
	).toBeUndefined()
	// a proposal carl took back is no longer standing
	const cancelledHistory = [
		...proposedHistory(),
		{ question: "never mind", answer: "Dropped it.", toolCalls: [toTopicEditToolCall("cancelTopicEdit")] },
	]
	expect(toConsentStep(0, { question: "yes", history: cancelledHistory }, savingTools)).toBeUndefined()
})

// a proposal the user already agreed to is spent. leaving it standing would latch the gate on, so every later yes
// in that conversation, to any question at all, would be forced into a tool that saves
test("toConsentStep leaves a yes alone once the proposal it answered was saved", () => {
	const savingTools = { updateTopicPrompt: {} } as never
	for (const savingToolName of TOPIC_SAVE_TOOL_NAMES) {
		const savedHistory = [
			...proposedHistory(),
			{ question: "yes", answer: "Saved.", toolCalls: [toTopicEditToolCall(savingToolName)] },
			{ question: "tell me about the second finding", answer: "Want me to dig in?", toolCalls: [] },
		]
		expect(toConsentStep(0, { question: "yes", history: savedHistory }, savingTools)).toBeUndefined()
	}
})

// a proposal carl makes after a save is standing again, so the yes that answers it still saves
test("toConsentStep forces a save for a proposal made after the last one was saved", () => {
	const savingTools = { updateTopicPrompt: {} } as never
	const reproposedHistory = [
		...proposedHistory(),
		{ question: "yes", answer: "Saved.", toolCalls: [toTopicEditToolCall("updateTopicFields")] },
		...proposedHistory(),
	]
	expect(toConsentStep(0, { question: "yes", history: reproposedHistory }, savingTools)).toEqual({
		toolChoice: "required",
		activeTools: ["updateTopicPrompt"],
	})
})

// one stored topic edit call, as a chat turn replays it
function toTopicEditToolCall(toolName: string): ChatToolCall {
	return { toolName, input: {}, output: "" }
}

// a conversation whose last topic edit call proposed a change
function proposedHistory(): ChatHistoryTurn[] {
	return [
		{ question: "favor video", answer: "Here is the change.", toolCalls: [toTopicEditToolCall("proposeTopicEdit")] },
	]
}

// two chat turns that called a tool must not share a tool call id, which a provider rejects
test("toModelMessages gives every replayed tool call its own id", () => {
	const toolCalls = [{ toolName: "addSource", input: {}, output: "Added." }]
	const modelMessages = toModelMessages(
		[
			{ question: "add one", answer: "Added.", toolCalls },
			{ question: "add two", answer: "Added.", toolCalls },
		],
		"and a third?",
		[],
	)
	const toolCallIds = modelMessages
		.filter((modelMessage) => modelMessage.role === "assistant" && Array.isArray(modelMessage.content))
		.flatMap((modelMessage) => modelMessage.content as { toolCallId?: string }[])
		.flatMap((part) => (part.toolCallId ? [part.toolCallId] : []))
	expect(toolCallIds.length).toBe(2)
	expect(new Set(toolCallIds).size).toBe(2)
})
