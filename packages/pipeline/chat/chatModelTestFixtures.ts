// the fake chat models the chat reply tests stream from, and the stream parts they write
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test"

// the usage every fake step reports
const MOCK_USAGE = {
	inputTokens: { total: 40, noCache: 40, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 12, text: 12, reasoning: 0 },
}

// the raw finish reason the provider sends for each unified one
const RAW_FINISH_REASONS = { stop: "stop", "tool-calls": "tool_calls" } as const

/**
 * Returns one text block's model stream parts, its text written in the given pieces.
 */
export function toTextStreamParts(id: string, textPieces: string[]): object[] {
	return [
		{ type: "text-start", id },
		...textPieces.map((textPiece) => ({ type: "text-delta", id, delta: textPiece })),
		{ type: "text-end", id },
	]
}

/**
 * Returns a step's finish part with the fake usage.
 */
export function toFinishStreamPart(finishReason: keyof typeof RAW_FINISH_REASONS): object {
	return {
		type: "finish",
		finishReason: { unified: finishReason, raw: RAW_FINISH_REASONS[finishReason] },
		usage: MOCK_USAGE,
	}
}

/**
 * Returns a fake model that streams the given steps' parts in order, one step per call.
 */
export function toStepsModel(stepsStreamParts: object[][]): MockLanguageModelV4 {
	let stepIndex = 0
	return new MockLanguageModelV4({
		doStream: async () => {
			// each call streams the next step, and a call past the last repeats it
			const streamParts = stepsStreamParts[Math.min(stepIndex, stepsStreamParts.length - 1)] ?? []
			stepIndex++
			return { stream: convertArrayToReadableStream(streamParts as never[]) }
		},
	})
}
