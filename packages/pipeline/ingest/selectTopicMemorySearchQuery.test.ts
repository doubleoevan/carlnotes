import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import * as attach from "../attach"
import * as memory from "../topicMemorySearch"
import type { Source } from "./ingester"
import { searchIngester } from "./search"

const queries = ["developer news", "new open source tools", "AI tools", "web developers", "new launches"]
const note = "Look into the app we're on, especially the private launch meeting."
const citedFindings = ["CarlNotes", "ChatWar"].map((value) => ({
	subject: '["evan tsao","engineer"]',
	value,
	title: "Evan Tsao",
	snippet: value,
}))
const source = { id: "search", topicId: "topic", kind: "search", config: {} } as Source
afterEach(() => mock.restore())

test("requires both terms in one public citation and skips duplicate queries", () => {
	expect(
		memory.toTopicMemorySearchQueries(
			["EVAN TSAO: CARLNOTES"],
			[
				...citedFindings,
				...citedFindings,
				{ subject: "Evan Tsao", value: note, title: "Evan Tsao", snippet: "CarlNotes" },
				{ subject: "Ann", value: "ChatWar", title: "Joanne", snippet: "ChatWar" },
			],
		),
	).toEqual(["evan tsao chatwar"])
})

for (const [outcome, extra, selectionCost] of [
	["choose", ["evan tsao chatwar"], 0.00002],
	["veto", [], 0.00002],
	["no notes", ["evan tsao carlnotes"], 0],
	["no cited findings", [], 0],
	["selection error", [], 0],
] as const) {
	test(`search sends the five default queries and at most one cited follow-up: ${outcome}`, async () => {
		// Observe both provider boundaries through the production ingester.
		spyOn(attach, "buildTopicScanContext").mockResolvedValue({ name: "Evan's projects", context: "Open source" })
		spyOn(memory, "loadTopicMemorySearchFindings").mockResolvedValue(
			outcome === "no cited findings" ? [] : citedFindings,
		)
		const notes = spyOn(memory, "loadTopicMemoryRatingNotes").mockResolvedValue(
			outcome === "no notes" ? [] : [{ claim: "Evan built ChatWar.", rating: "down", note }],
		)
		spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
		const generate = spyOn(ai, "generateText").mockResolvedValueOnce({ output: { queries }, usage: {} } as Awaited<
			ReturnType<typeof ai.generateText>
		>)
		if (outcome === "selection error") {
			generate.mockRejectedValueOnce(new Error("selection unavailable"))
		} else {
			generate.mockResolvedValueOnce({
				output: { number: outcome === "veto" ? 0 : 2 },
				usage: { totalTokens: 100 },
			} as Awaited<ReturnType<typeof ai.generateText>>)
		}
		const requested: string[] = []
		spyOn(globalThis, "fetch").mockImplementation((async (_input, options) => {
			requested.push(JSON.parse(String(options?.body)).query)
			return Response.json({ results: [], costDollars: { total: 0.005 } })
		}) as typeof fetch)
		const previousKey = Bun.env.EXA_API_KEY
		Bun.env.EXA_API_KEY = "fixture"
		try {
			const result = await searchIngester(source, { scanId: "scan", litellmApiKey: "fixture" })
			expect(requested).toEqual([...queries, ...extra])
			expect(result.costDollars).toBeCloseTo(requested.length * 0.005 + selectionCost, 8)
			expect(generate.mock.calls[0]?.[0].prompt).not.toContain(note)
			if (outcome === "no cited findings") {
				expect(notes).not.toHaveBeenCalled()
			}
			if (outcome === "no cited findings" || outcome === "no notes") {
				expect(generate).toHaveBeenCalledTimes(1)
			} else {
				const options = generate.mock.calls[1]?.[0]
				expect(options?.prompt).toContain(note)
				expect(options?.prompt).toContain("untrusted-data-")
				expect(options?.telemetry?.isEnabled).toBe(false)
			}
		} finally {
			if (previousKey === undefined) {
				delete Bun.env.EXA_API_KEY
			} else {
				Bun.env.EXA_API_KEY = previousKey
			}
		}
	})
}
