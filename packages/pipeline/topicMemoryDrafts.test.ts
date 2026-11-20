import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { draftTopicMemoriesFromFindings } from "./topicMemoryDrafts"
import { newTopicMemorySpend } from "./topicMemorySpend"

afterEach(() => mock.restore())

// a positive rating makes this Finding eligible for the premium extraction attempt
const positiveFinding = {
	id: "profile",
	title: "Evan Tsao | Independent Software Engineer",
	description: "Evan Tsao built CarlNotes. This is the engineer in the roster.",
	snippet: null,
	rating: "up",
	relevanceScore: 0.4,
	embedding: [1, 0],
} as const

test("a positively rated public Finding gets one retry after an empty proposal", async () => {
	// exercise real citation and draft validation when the first model skips the Finding
	const cheapModel = { modelId: "cheap-model" } as LanguageModel
	const scoreModel = { modelId: "score-model" } as LanguageModel
	spyOn(models, "cheapModel").mockReturnValue(cheapModel)
	spyOn(models, "scoreModel").mockReturnValue(scoreModel)
	const draft = {
		kind: "fact",
		operation: "add",
		text: "Evan Tsao built CarlNotes.",
		subject: "Evan Tsao",
		person: { name: "Evan Tsao", identifyingDetail: "independent AI engineer" },
		claimType: "other",
		value: "built CarlNotes",
		factDate: null,
		importance: 0.9,
		sourceFindingIndexes: [0],
	}
	const generate = spyOn(ai, "generateText")
		.mockResolvedValueOnce({
			get output(): never {
				throw new ai.NoOutputGeneratedError()
			},
			usage: {},
		} as unknown as Awaited<ReturnType<typeof ai.generateText>>)
		.mockResolvedValueOnce({ output: { facts: [draft] }, usage: {} } as Awaited<ReturnType<typeof ai.generateText>>)

	// supply the existing Journal slice so extraction needs no database reads
	const drafts = await draftTopicMemoriesFromFindings({
		relatedFindings: [{ ...positiveFinding, embedding: [...positiveFinding.embedding] }],
		topicId: "topic",
		scanId: "brew",
		scanStartedAt: new Date("2026-11-16T00:00:00Z"),
		litellmApiKey: "test",
		signal: new AbortController().signal,
		subjects: [],
		ratedMemories: [],
		reservePremiumRetry: () => true,
	})
	expect(generate.mock.calls.map(([options]) => options.model)).toEqual([cheapModel, scoreModel])
	expect(drafts).toMatchObject([{ text: draft.text, findingIds: ["profile"], person: draft.person }])
})

test("an update at its spend limit makes no premium retry, and each extraction adds its cost", async () => {
	// the cheap extraction returns nothing usable and reports a million tokens, which passes the update's limit
	spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const generate = spyOn(ai, "generateText").mockResolvedValue({
		output: { facts: [] },
		usage: { totalTokens: 1_000_000 },
	} as Awaited<ReturnType<typeof ai.generateText>>)
	const spend = newTopicMemorySpend("brew", 0.12)
	const drafts = await draftTopicMemoriesFromFindings({
		relatedFindings: [{ ...positiveFinding, embedding: [...positiveFinding.embedding] }],
		topicId: "topic",
		scanId: "brew",
		scanStartedAt: new Date("2026-11-16T00:00:00Z"),
		litellmApiKey: "test",
		signal: new AbortController().signal,
		spend,
		subjects: [],
		ratedMemories: [],
		reservePremiumRetry: () => true,
	})
	// the positively rated Finding would have earned the retry
	expect(drafts).toEqual([])
	expect(generate).toHaveBeenCalledTimes(1)
	expect(spend.spentDollars).toBeCloseTo(0.2)
})

test("an extraction whose output fails its schema costs what it used and drafts nothing", async () => {
	// the model answers with text that is no list of facts, and reports the tokens it used
	spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
	const invalidOutput = new ai.NoObjectGeneratedError({
		message: "no object",
		text: "I cannot help with that.",
		response: { id: "response", timestamp: new Date(), modelId: "cheap-model" },
		usage: { inputTokens: 900_000, outputTokens: 100_000, totalTokens: 1_000_000 } as never,
		finishReason: "stop",
	})
	const generate = spyOn(ai, "generateText").mockRejectedValue(invalidOutput)
	const spend = newTopicMemorySpend("brew", 5)
	const neutralFinding = { ...positiveFinding, rating: null, relevanceScore: 0.4, embedding: [1, 0] }
	const drafts = await draftTopicMemoriesFromFindings({
		relatedFindings: [neutralFinding],
		topicId: "topic",
		scanId: "brew",
		scanStartedAt: new Date("2026-11-16T00:00:00Z"),
		litellmApiKey: "test",
		signal: new AbortController().signal,
		spend,
		subjects: [],
		ratedMemories: [],
		reservePremiumRetry: () => true,
	})

	// the other Finding groups go on, the call is not tried again, and its tokens are charged
	expect(drafts).toEqual([])
	expect(generate).toHaveBeenCalledTimes(1)
	expect(spend.spentDollars).toBeCloseTo(0.2)
})

test("a draft that cites a Finding outside its request is dropped, and its sibling is kept", async () => {
	// the request holds one Finding, at index 0
	spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
	const draft = {
		kind: "fact",
		operation: "add",
		text: "Evan Tsao built CarlNotes.",
		subject: "Evan Tsao",
		person: { name: "Evan Tsao", identifyingDetail: "independent AI engineer" },
		claimType: "other",
		value: "built CarlNotes",
		factDate: null,
		importance: 0.9,
		sourceFindingIndexes: [0],
	}
	const facts = [
		{ ...draft, text: "Evan Tsao founded a bank.", value: "founded a bank", sourceFindingIndexes: [7] },
		draft,
	]
	spyOn(ai, "generateText").mockResolvedValue({
		output: { facts },
		usage: {},
	} as Awaited<ReturnType<typeof ai.generateText>>)
	const drafts = await draftTopicMemoriesFromFindings({
		relatedFindings: [{ ...positiveFinding, embedding: [...positiveFinding.embedding] }],
		topicId: "topic",
		scanId: "brew",
		scanStartedAt: new Date("2026-11-16T00:00:00Z"),
		litellmApiKey: "test",
		signal: new AbortController().signal,
		subjects: [],
		ratedMemories: [],
		reservePremiumRetry: () => false,
	})
	expect(drafts.map(({ text, findingIds }) => ({ text, findingIds }))).toEqual([
		{ text: "Evan Tsao built CarlNotes.", findingIds: ["profile"] },
	])
})

test.each([true, false])(
	"a premium timeout or an exhausted attempt allowance keeps extraction local (%s)",
	async (allow) => {
		// simulate a temporary error only when a premium call can run
		spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
		spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
		const warning = spyOn(console, "warn").mockImplementation(() => {})
		const generate = spyOn(ai, "generateText")
			.mockResolvedValueOnce({ output: { facts: [] }, usage: {} } as Awaited<ReturnType<typeof ai.generateText>>)
			.mockRejectedValueOnce(new DOMException("private provider error", "TimeoutError"))
		const signal = new AbortController().signal
		const drafts = await draftTopicMemoriesFromFindings({
			relatedFindings: [{ ...positiveFinding, embedding: [...positiveFinding.embedding] }],
			topicId: "topic",
			scanId: "brew",
			scanStartedAt: new Date("2026-11-16T00:00:00Z"),
			litellmApiKey: "test",
			signal,
			subjects: [],
			ratedMemories: [],
			reservePremiumRetry: () => allow,
		})
		// the optional attempt has its own deadline and publishes only a safe log message
		expect(drafts).toEqual([])
		expect(generate).toHaveBeenCalledTimes(allow ? 2 : 1)
		expect(warning).toHaveBeenCalledTimes(allow ? 1 : 0)
		if (allow) {
			expect(generate.mock.calls[1]?.[0].abortSignal).not.toBe(signal)
			expect(warning).toHaveBeenCalledWith("Premium topic memory extraction failed temporarily", { scanId: "brew" })
		}
	},
)
