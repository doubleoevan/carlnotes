// owner-run live smoke for a topic Scan (ingestion + curation): seed a topic + rss source, run runTopicScan, and assert the outputs
// NOT a bun test (it makes real proxy/Firecrawl calls, so the offline gate ignores this filename); run with: bun run smoke:scan
// prereqs: the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, sources, topics, users } from "../db/schema"
import { runTopicScan } from "./scan"

// a real, reliably-up feed on a coherent topic, plus a matching context so relevant resources clear the gate
const FEED_URL = "https://simonwillison.net/atom/everything/"
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// pgvector comes back as number[] via drizzle's vector mapper
function vectorLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0
}

// seed a throwaway owner, a topic whose context matches the feed, and a keyless rss source
async function seed(): Promise<{ topicId: string; userId: string }> {
	// a throwaway owner — topic/source/scan/findings cascade from it on cleanup
	const [user] = await db
		.insert(users)
		.values({ name: "scan-smoke", email: `scan-smoke+${Date.now()}@example.test` })
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}
	// a topic whose context matches the feed so the embed-filter keeps relevant resources
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "LLM scan smoke", context: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}
	// a keyless rss source pointing at the feed
	await db.insert(sources).values({ topicId: topic.id, kind: "rss", config: { url: FEED_URL } })
	return { topicId: topic.id, userId: user.id }
}

// run the pipeline and check the smoke assertions, printing a report; returns true when all pass
async function check(topicId: string): Promise<boolean> {
	// run the full pipeline (ingestion + curation) for the topic
	const scan = await runTopicScan(topicId)
	if (!scan) {
		throw new Error("runTopicScan returned no scan")
	}

	// read this topic's findings and a sample embedded resource
	const topicFindings = await db.select().from(findings).where(eq(findings.topicId, topicId))
	const [embedded] = await db
		.select({ embedding: resources.embedding, model: resources.embeddingModel })
		.from(resources)
		.where(isNotNull(resources.embedding))
		.limit(1)

	// for an rss-only scan ingestion cost is 0, so total cost should equal the summed curation stage costs
	const totalCost = Number(scan.cost)
	const summedStages = Object.values(scan.stageCosts).reduce((sum, value) => sum + value, 0)
	const withWhy = topicFindings.filter((finding) => finding.whySummary.trim().length > 0)
	const embeddingLength = vectorLength(embedded?.embedding)

	// print the scan-level report
	console.log("\n=== topic scan smoke report ===")
	console.log(`scan.status        : ${scan.status}`)
	console.log(`found/kept/filtered: ${scan.foundCount} / ${scan.keptCount} / ${scan.filteredCount}`)
	console.log(`cost               : ${totalCost}`)
	console.log(`stage_costs        : ${JSON.stringify(scan.stageCosts)} (sum ${summedStages.toFixed(6)})`)
	// print the findings/embedding report
	console.log(`findings           : ${topicFindings.length} (with why-summary: ${withWhy.length})`)
	console.log(`embedding length   : ${embeddingLength} (model ${embedded?.model})`)
	if (withWhy[0]) {
		console.log(`sample why-summary : ${withWhy[0].whySummary}`)
	}

	// the smoke assertions: a real scan produced embeddings, findings, why-summaries, and consistent per-stage cost
	const results: [string, boolean][] = [
		// pipeline-level checks
		["scan succeeded", scan.status === "succeeded"],
		["found resources", scan.foundCount > 0],
		["embedding is 768-dim", embeddingLength === 768],
		// curation-output checks
		["kept_count matches findings", scan.keptCount === topicFindings.length],
		["stage_costs sum to cost", Math.abs(totalCost - summedStages) < 1e-6],
		["at least one finding", topicFindings.length > 0],
		["a finding has a why-summary", withWhy.length > 0],
	]
	// print each check and compute the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// orchestrate: seed, check, always clean up the throwaway owner (cascades topic/source/scan/findings)
async function main(): Promise<number> {
	const { topicId, userId } = await seed()
	// run the checks, then delete the owner regardless of outcome
	try {
		const pass = await check(topicId)
		console.log(`\n=== smoke ${pass ? "PASSED" : "FAILED"} ===`)
		return pass ? 0 : 1
	} finally {
		await db.delete(users).where(eq(users.id, userId))
	}
}

// run it, then exit (the Neon pool would otherwise keep the process alive); a thrown error is a failure
main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
