// chat reply stream tests: the paragraph break between the text a tool call split, and the stored text of every step
import { expect, test } from "bun:test"
import { stepCountIs, streamText, type TextStreamPart, type ToolSet, tool } from "ai"
import type { MockLanguageModelV4 } from "ai/test"
import { z } from "zod"
import { toFinishStreamPart, toStepsModel, toTextStreamParts } from "./chatModelTestFixtures"
import { breakTextAroundToolCalls, toStepsText } from "./index"

// one text block's parts, and one tool call with its result, for building a fake reply stream
function textBlock(id: string, text: string): TextStreamPart<ToolSet>[] {
	return [
		{ type: "text-start", id },
		{ type: "text-delta", id, text },
		{ type: "text-end", id },
	]
}

// one tool call with its result, the split between two text blocks
const toolCall = [
	{ type: "tool-call", toolCallId: "call-1", toolName: "draftTopic", input: {} },
	{ type: "tool-result", toolCallId: "call-1", toolName: "draftTopic", input: {}, output: "ok" },
] as TextStreamPart<ToolSet>[]

// run parts through the transform and join the text deltas that come out
async function toTransformedText(streamParts: TextStreamPart<ToolSet>[]): Promise<string> {
	// feed the parts through the transform as one stream
	const partStream = new ReadableStream<TextStreamPart<ToolSet>>({
		start(controller) {
			for (const streamPart of streamParts) {
				controller.enqueue(streamPart)
			}
			controller.close()
		},
	})
	// the transform under test, read from its far end
	const reader = partStream.pipeThrough(breakTextAroundToolCalls()({ tools: {}, stopStream: () => {} })).getReader()

	// join the text deltas that come out
	let collectedText = ""
	while (true) {
		const { done, value } = await reader.read()
		// stop at the end of the stream, and collect only text
		if (done) {
			return collectedText
		}
		if (value.type === "text-delta") {
			collectedText += value.text
		}
	}
}

// text before a tool call and text after it get one paragraph break between them
test("breakTextAroundToolCalls separates the text a tool call split", async () => {
	const streamParts = [...textBlock("t1", "Writing that now:"), ...toolCall, ...textBlock("t2", "Draft's saved.")]
	expect(await toTransformedText(streamParts)).toBe("Writing that now:\n\nDraft's saved.")
})

// a call before any text adds nothing, two calls in a row add one break, and text with no call keeps its shape
test("breakTextAroundToolCalls adds no break where no text was split", async () => {
	expect(await toTransformedText([...toolCall, ...textBlock("t1", "Hi.")])).toBe("Hi.")
	expect(await toTransformedText([...textBlock("t1", "A"), ...toolCall, ...toolCall, ...textBlock("t2", "B")])).toBe(
		"A\n\nB",
	)
	expect(await toTransformedText([...textBlock("t1", "One "), ...textBlock("t2", "two.")])).toBe("One two.")
})

// a model that writes a sentence and calls a tool, then writes a second paragraph once the tool returns
function toToolSplitModel(): MockLanguageModelV4 {
	return toStepsModel([
		[
			...toTextStreamParts("1", ["Let me look."]),
			{ type: "tool-call", toolCallId: "call-1", toolName: "look", input: "{}" },
			toFinishStreamPart("tool-calls"),
		],
		[...toTextStreamParts("2", ["Found it."]), toFinishStreamPart("stop")],
	])
}

// a reply's own text is only its final step's, so the stored answer joins every step's text the way it streamed
test("toStepsText keeps the text a reply wrote before a tool call, as the stream showed it", async () => {
	const replyStream = streamText({
		model: toToolSplitModel(),
		prompt: "where is it?",
		tools: { look: tool({ inputSchema: z.object({}), execute: async () => "here" }) },
		stopWhen: stepCountIs(3),
		experimental_transform: breakTextAroundToolCalls(),
	})

	// read the stream the way the chat does, collecting its text
	let streamedText = ""
	for await (const streamPart of replyStream.fullStream) {
		if (streamPart.type === "text-delta") {
			streamedText += streamPart.text
		}
	}

	// the final step's text alone drops the first sentence, and the joined steps keep it
	expect((await replyStream.text).trim()).toBe("Found it.")
	expect(toStepsText(await replyStream.steps)).toBe(streamedText)
	expect(streamedText).toBe("Let me look.\n\nFound it.")
})
