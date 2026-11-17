import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { reconcileTopicMemoryClaims } from "./topicMemoryReconciliation"

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
