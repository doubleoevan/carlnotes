// a live smoke test the owner runs by hand for a full topic Scan, ingestion then curation. it seeds a topic and an RSS source, runs runTopicScan, and checks the outputs
// run it with: bun run smoke:scan. it needs the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, sources, topics, users } from "../db/schema"
import { runTopicScan } from "./scan"

// a real feed that is reliably up, plus a topic context that matches it so relevant resources pass the relevance gate
const FEED_URL = "https://simonwillison.net/atom/everything/"
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// pgvector comes back as a number via drizzle's vector mapper
function vectorLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0
}

// seed a fake owner, a topic whose context matches the feed, and an RSS source with no API key
async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic, source, scan, and findings
	const [user] = await db
		.insert(users)
		.values({ name: "scan-smoke", email: `scan-smoke+${Date.now()}@example.test` })
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic whose context matches the feed so the relevance gate allows resources to be returned
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "LLM scan smoke", prompt: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// an RSS source with no API key pointing at the feed
	await db.insert(sources).values({ topicId: topic.id, kind: "rss", config: { url: FEED_URL } })
	return { topicId: topic.id, userId: user.id }
}

// run the pipeline, check the smoke assertions, and print a report. returns true when every check passes
async function check(topicId: string): Promise<boolean> {
	// run the full pipeline for the topic, ingestion then curation
	const topicScan = await runTopicScan(topicId)
	if (!topicScan) {
		throw new Error("runTopicScan returned no scan")
	}

	// read this topic's findings and a sample embedded resource
	const topicFindings = await db.select().from(findings).where(eq(findings.topicId, topicId))
	const [embedded] = await db
		.select({ embedding: resources.embedding, model: resources.embeddingModel })
		.from(resources)
		.where(isNotNull(resources.embedding))
		.limit(1)

	// for an RSS-only scan, ingestion cost is 0, so the total cost should equal the sum of the curation stage costs
	const totalCost = Number(topicScan.cost)
	const summedStages = Object.values(topicScan.stageCosts).reduce((sum, value) => sum + value, 0)
	const withWhy = topicFindings.filter((finding) => finding.relevanceExplanation.trim().length > 0)
	const embeddingLength = vectorLength(embedded?.embedding)

	// print the topic scan report
	console.log("\n=== topic scan smoke report ===")
	console.log(`scan.status        : ${topicScan.status}`)
	console.log(`found/kept/filtered: ${topicScan.foundCount} / ${topicScan.keptCount} / ${topicScan.filteredCount}`)
	console.log(`cost               : ${totalCost}`)
	console.log(`stage_costs        : ${JSON.stringify(topicScan.stageCosts)} (sum ${summedStages.toFixed(6)})`)
	// print the findings and embedding report
	console.log(`findings           : ${topicFindings.length} (with why-summary: ${withWhy.length})`)
	console.log(`embedding length   : ${embeddingLength} (model ${embedded?.model})`)
	if (withWhy[0]) {
		console.log(`sample why-summary : ${withWhy[0].relevanceExplanation}`)
	}

	// the smoke assertions. a real scan produced embeddings, findings, why-summaries, and per-stage costs that sum to the total
	const results: [string, boolean][] = [
		// topic scan checks
		["scan succeeded", topicScan.status === "succeeded"],
		["found resources", topicScan.foundCount > 0],
		["embedding is 768-dim", embeddingLength === 768],

		// topic findings checks
		["kept_count matches findings", topicScan.keptCount === topicFindings.length],
		["stage_costs sum to cost", Math.abs(totalCost - summedStages) < 1e-6],
		["at least one finding", topicFindings.length > 0],
		["a finding has a why-summary", withWhy.length > 0],
	]

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// seed the test data and run the checks, then always delete the fake owner
// the delete cascades to the topic, source, scan, and findings
async function smokeTest(): Promise<number> {
	const { topicId, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const pass = await check(topicId)
		console.log(`\n=== smoke ${pass ? "PASSED" : "FAILED"} ===`)
		return pass ? 0 : 1
	} finally {
		await db.delete(users).where(eq(users.id, userId))
	}
}

// run the smoke test, then exit because the Neon pool would otherwise keep the process alive. a thrown error is a failure
try {
	const exitCode = await smokeTest()
	process.exit(exitCode)
} catch (error) {
	console.error(error)
	process.exit(1)
}
