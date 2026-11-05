// personal sources Resource candidates carry only public URL data
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as queue from "@carlnotes/db/personalSourcesLinkQueue"
import { aiAgentIngester } from "./aiAgent"
import { emailIngester } from "./email"
import { toScanSummary } from "./index"
import type { Source } from "./ingester"

afterEach(() => mock.restore())

test("both personal sources kinds return public fallback titles and null snippets with no private metadata", async () => {
	spyOn(queue, "claimPersonalSourcesLinks").mockResolvedValue([
		{ id: "private-entry", url: "https://example.org/public-article", personalSourceScoreBonus: 0.1 },
	])
	for (const [kind, ingester] of [
		["ai_agent", aiAgentIngester],
		["email", emailIngester],
	] as const) {
		const result = await ingester({ id: "source", kind } as Source, { scanId: "scan" })
		expect(result).toEqual({
			resources: [
				{
					url: "https://example.org/public-article",
					title: "public article",
					snippet: null,
					kind: "read",
					isFromPersonalSources: true,
				},
			],
			costDollars: 0,
		})
		expect(JSON.stringify(result)).not.toContain("private-entry")
		expect(JSON.stringify(result)).not.toContain("personalSourceScoreBonus")
	}
})

test("empty or unclaimed Personal sources supply no candidates", async () => {
	const claim = spyOn(queue, "claimPersonalSourcesLinks").mockResolvedValue([])
	expect((await aiAgentIngester({ id: "source" } as Source)).resources).toHaveLength(0)
	expect(claim).not.toHaveBeenCalled()
	expect((await emailIngester({ id: "source" } as Source, { scanId: "scan" })).resources).toHaveLength(0)
})

test("a public Source keeps a duplicate URL available after its private claim disappears", () => {
	const resource = { url: "https://example.org/article", title: "Article", kind: "read" as const, snippet: null }
	const summary = toScanSummary([
		{
			status: "ok",
			sourceId: "personalSources",
			sourceKind: "ai_agent",
			label: "Agent",
			durationMs: 0,
			resources: [{ ...resource, isFromPersonalSources: true }],
			costDollars: 0,
		},
		{
			status: "ok",
			sourceId: "rss",
			sourceKind: "rss",
			label: "RSS",
			durationMs: 0,
			resources: [resource],
			costDollars: 0,
		},
	])
	expect(summary.resources).toHaveLength(1)
	expect(summary.resources[0]?.sourceId).toBe("personalSources")
	expect(summary.resources[0]?.isFromPersonalSources).toBe(false)
	expect(summary.sourceResults.map((result) => result.foundCount)).toEqual([1, 0])
})
