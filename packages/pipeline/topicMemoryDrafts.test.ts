import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { draftTopicMemoriesFromFindings } from "./topicMemoryDrafts"
import * as spend from "./topicMemorySpend"

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
	spyOn(spend, "recordTopicMemorySpend").mockResolvedValue(undefined)
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

test.each([true, false])(
	"a premium timeout or an exhausted attempt allowance keeps extraction local (%s)",
	async (allow) => {
		// simulate a temporary error only when a premium call can run
		spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
		spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
		spyOn(spend, "recordTopicMemorySpend").mockResolvedValue(undefined)
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
