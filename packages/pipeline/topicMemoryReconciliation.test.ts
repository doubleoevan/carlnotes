import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { APICallError, NoObjectGeneratedError } from "ai"
import * as topicMemoryEvidence from "./topicMemoryEvidence"
import { loadTopicMemoryReconciliationJournal, reconcileTopicMemoryClaims } from "./topicMemoryReconciliation"
import { newTopicMemorySpend } from "./topicMemorySpend"

afterEach(() => mock.restore())

test("a no-op keeps the checked fact eligible for a guarded write", async () => {
	// present a new person's project alongside two equivalent prices, a distinct price, and a conflicting date
	const price = {
		text: "The Standard edition costs 10 USD.",
		subject: "Standard edition",
		claimType: "price",
		value: "USD 10",
		factDate: "2026-11-01",
		person: null,
		embedding: [1, 0],
	}
	const project = {
		text: "Evan Tsao built CarlNotes.",
		subject: "Evan Tsao",
		claimType: "other",
		value: "built CarlNotes",
		factDate: null,
		person: { name: "Evan Tsao", identifyingDetail: "independent AI engineer" },
		embedding: [0, 1],
	}
	const candidates = [
		project,
		price,
		{ ...price, text: "The Standard edition is priced at USD 10.", value: "usd 10" },
		{ ...price, text: "The Standard edition costs 20 USD.", value: "USD 20" },
		{ ...price, factDate: "2025-11-01" },
	]

	// keep only the model stub so the production reconciliation checks its decisions
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const operations = candidates.map((_, index) => ({
		index,
		operation: index === 1 ? "add" : "noOp",
		memoryId: null,
		useCandidateText: false,
	}))
	spyOn(ai, "generateText").mockResolvedValue({
		output: { operations },
		usage: {},
	} as Awaited<ReturnType<typeof ai.generateText>>)
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates,
		journal: [],
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
	})

	// let the writer check the paraphrase against current storage and keep the other facts separate
	expect(reconciledClaims).toEqual([
		{ operation: "add" },
		{ operation: "add" },
		{ operation: "add", combineWithExactMatch: true },
		{ operation: "add" },
		{ operation: "add" },
	])
})

test("a rate limit on a match call waits and tries again inside the attempt", async () => {
	// the first response is a 429 and the second matches the one candidate
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	spyOn(Bun, "sleep").mockResolvedValue(undefined)
	spyOn(console, "warn").mockImplementation(() => {})
	const rateLimit = new APICallError({
		message: "rate limited",
		url: "https://litellm.test/v1/chat/completions",
		requestBodyValues: {},
		statusCode: 429,
		responseBody: "{}",
	})
	const generateText = spyOn(ai, "generateText")
		.mockRejectedValueOnce(rateLimit)
		.mockResolvedValue({
			output: { operations: [{ index: 0, operation: "add", memoryId: null, useCandidateText: false }] },
			usage: {},
		} as Awaited<ReturnType<typeof ai.generateText>>)
	const candidate = {
		text: "The Standard edition costs 10 USD.",
		subject: "Standard edition",
		claimType: "price",
		value: "USD 10",
		factDate: null,
		person: null,
		embedding: [1, 0],
	}
	const journal = [{ ...candidate, id: "memory-1", text: "The Pro edition costs 20 USD.", updatedAt: new Date() }]

	// the update's attempt finishes with one extra call and no failure
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates: [candidate],
		journal,
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
	})
	expect(reconciledClaims).toEqual([{ operation: "add" }])
	expect(generateText).toHaveBeenCalledTimes(2)
})

test("an update at its spend limit starts no match and writes none of its unmatched candidates", async () => {
	const generateText = spyOn(ai, "generateText")
	const candidate = {
		text: "The Standard edition costs 10 USD.",
		subject: "Standard edition",
		claimType: "price",
		value: "USD 10",
		factDate: null,
		person: null,
		embedding: [1, 0],
	}
	// thirty candidates would make two calls against the Journal
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates: Array.from({ length: 30 }, () => candidate),
		journal: [{ ...candidate, id: "memory-1", updatedAt: new Date() }],
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
		spend: { ...newTopicMemorySpend("scan-1", 0.12), spentDollars: 0.12 },
	})
	expect(reconciledClaims).toHaveLength(30)
	expect(reconciledClaims.every(({ operation }) => operation === "noOp")).toBe(true)
	expect(generateText).not.toHaveBeenCalled()
})

test("a truncated match that reaches the spend limit retries no smaller batch", async () => {
	// the one match call returns no object, and its usage costs more than the update's limit
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const generateText = spyOn(ai, "generateText").mockRejectedValue(
		new NoObjectGeneratedError({
			message: "no object",
			text: "{",
			response: { id: "response", timestamp: new Date(), modelId: "score-model" },
			usage: { inputTokens: 0, outputTokens: 1_000_000, totalTokens: 1_000_000 } as never,
			finishReason: "length",
		}),
	)
	const candidate = {
		text: "The Standard edition costs 10 USD.",
		subject: "Standard edition",
		claimType: "price",
		value: "USD 10",
		factDate: null,
		person: null,
		embedding: [1, 0],
	}
	const spend = newTopicMemorySpend("scan-1", 0.12)
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates: [candidate, { ...candidate, text: "The Pro edition costs 20 USD.", value: "USD 20" }],
		journal: [{ ...candidate, id: "memory-1", updatedAt: new Date() }],
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
		spend,
	})

	// both halves are left unmatched with no second call, and the failed call's usage is charged
	expect(reconciledClaims).toEqual([{ operation: "noOp" }, { operation: "noOp" }])
	expect(generateText).toHaveBeenCalledTimes(1)
	expect(spend.spentDollars).toBeCloseTo(4.4)
})

test("a Journal past the input budget is matched a batch at a time against the batch's nearest rows", async () => {
	// thirty candidates, each with the same two nearest rows and one row of its own
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const candidates = Array.from({ length: 30 }, (_, index) => ({
		text: `Edition ${index} costs 10 USD.`,
		subject: `Edition ${index}`,
		claimType: "price",
		value: "USD 10",
		factDate: null,
		person: null,
		embedding: [index, 1],
	}))
	type NeighborRow = Awaited<ReturnType<typeof topicMemoryEvidence.loadTopicMemoryNeighbors>>[number]
	const toRow = (id: string): NeighborRow =>
		({ id, text: `Row ${id}.`, factDate: null, person: null, updatedAt: new Date() }) as unknown as NeighborRow
	const loadNeighbors = spyOn(topicMemoryEvidence, "loadTopicMemoryNeighbors").mockImplementation(
		async (_topicId, embedding) => [toRow("shared-1"), toRow("shared-2"), toRow(`own-${embedding[0]}`)],
	)
	const generateText = spyOn(ai, "generateText").mockImplementation((async ({ prompt }: { prompt: string }) => ({
		output: {
			operations: [...prompt.matchAll(/"index":(\d+)/g)].map(([, index]) => ({
				index: Number(index),
				operation: "add",
				memoryId: null,
				useCandidateText: false,
			})),
		},
		usage: {},
	})) as unknown as typeof ai.generateText)

	// no Journal was loaded, because its rows did not fit the budget
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates,
		journal: undefined,
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
	})

	// two calls of fifteen candidates, where a call a candidate would have made thirty
	expect(reconciledClaims).toEqual(candidates.map(() => ({ operation: "add" })))
	expect(generateText).toHaveBeenCalledTimes(2)
	expect(loadNeighbors).toHaveBeenCalledTimes(30)

	// each call lists a shared row once, beside each candidate's own row
	const [firstPrompt] = generateText.mock.calls.map(([options]) => String(options.prompt))
	expect(firstPrompt?.split('"id":"shared-1"')).toHaveLength(2)
	expect(firstPrompt?.split('"id":"own-')).toHaveLength(16)
})

test("the Journal that a match reads is in the order its rows were first seen", async () => {
	const queries = stubConnectionPool(() => [])
	try {
		expect(await loadTopicMemoryReconciliationJournal("topic-1")).toEqual([])
		// a row's first Scan decides its place, so the earliest matching row is the one first seen earliest
		expect(queries[0]?.text).toContain('"first_scans"."id" = "topic_memories"."first_scan_id"')
		expect(queries[0]?.text).toContain('order by "first_scans"."started_at" asc, "topic_memories"."id" asc')
	} finally {
		restoreConnectionPool()
	}
})

test("a match's reply is applied only for a known row, once a candidate, with no conflict", async () => {
	// one stored row about the Standard edition's price on November 1
	spyOn(models, "scoreModel").mockReturnValue({} as LanguageModel)
	const row = {
		id: "memory-1",
		text: "The Standard edition costs 10 USD.",
		subject: "Standard edition",
		claimType: "price",
		value: "USD 10",
		factDate: "2026-11-01",
		person: null,
		updatedAt: new Date("2026-11-02T00:00:00Z"),
	}
	type Candidate = Omit<typeof row, "id" | "updatedAt" | "factDate"> & { factDate: string | null; embedding: number[] }
	const toCandidate = (factDate: string | null): Candidate => {
		const { id: _id, updatedAt: _updatedAt, ...claim } = row
		return { ...claim, factDate, embedding: [1, 0] }
	}
	const candidates = [
		toCandidate("2026-11-01"),
		toCandidate("2026-11-01"),
		toCandidate("2026-11-01"),
		toCandidate("2026-11-01"),
		toCandidate("2025-06-01"),
	]

	// the model updates the row for the first, answers twice for the second, skips the third, names an unknown row
	// for the fourth, and matches a conflicting date for the fifth
	type Reply = { index: number; operation: "update"; memoryId: string; useCandidateText: boolean }
	const toUpdate = (index: number, memoryId: string): Reply => ({
		index,
		operation: "update",
		memoryId,
		useCandidateText: true,
	})
	const operations = [
		toUpdate(0, "memory-1"),
		toUpdate(1, "memory-1"),
		toUpdate(1, "memory-1"),
		toUpdate(3, "memory-9"),
		toUpdate(4, "memory-1"),
	]
	spyOn(ai, "generateText").mockResolvedValue({
		output: { operations },
		usage: {},
	} as Awaited<ReturnType<typeof ai.generateText>>)
	const reconciledClaims = await reconcileTopicMemoryClaims({
		candidates,
		journal: [row],
		topicId: "topic",
		litellmApiKey: "test",
		signal: new AbortController().signal,
	})

	// only the first reply changes the Journal
	expect(reconciledClaims).toEqual([
		{ operation: "update", target: row, useCandidateText: true },
		{ operation: "noOp" },
		{ operation: "noOp" },
		{ operation: "noOp" },
		{ operation: "noOp" },
	])
})
