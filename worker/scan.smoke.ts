// a live smoke test the owner runs by hand for a full topic Scan, ingestion then review. it seeds a topic and an RSS source, runs runTopicScan, and checks the outputs
// run it with: bun run smoke:scan. it needs the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, sources, topics, users } from "../db/schema"
// the extracted prompt builders, loaded here to prove that each writes its prompt from its Markdown template
import { buildSearchPrompt } from "./adapters/search"
import { buildContextPrompt } from "./attach"
import { buildScanReportPrompt, buildScorePrompt } from "./review"
import { runTopicScan } from "./scan"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

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

// run the topic scan pipeline, check the smoke assertions, and print a report. returns true when every check passes
async function check(topicId: string): Promise<boolean> {
	// run the full pipeline for the topic, ingestion then review
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

	// for an RSS-only scan, ingestion cost is 0, so the total cost should equal the sum of the review stage costs
	const totalCost = Number(topicScan.cost)
	const totalStageCosts = Object.values(topicScan.stageCosts).reduce((sum, value) => sum + value, 0)
	const findingsWithExplanations = topicFindings.filter((finding) => finding.relevanceExplanation.trim().length > 0)
	const embeddingLength = vectorLength(embedded?.embedding)

	// the longest relevance explanation must be substantive, well beyond one line
	const explanationLengths = topicFindings.map((finding) => finding.relevanceExplanation.trim().length)
	const longestExplanationLength = Math.max(0, ...explanationLengths)

	// print the topic scan report
	console.log("\n=== topic scan smoke report ===")
	console.log(`scan.status        : ${topicScan.status}`)
	console.log(`found/kept/filtered: ${topicScan.foundCount} / ${topicScan.keptCount} / ${topicScan.filteredCount}`)
	console.log(`cost               : ${totalCost}`)
	console.log(`stage_costs        : ${JSON.stringify(topicScan.stageCosts)} (sum ${totalStageCosts.toFixed(6)})`)
	// print the findings and embedding report
	console.log(`findings           : ${topicFindings.length} (with explanations: ${findingsWithExplanations.length})`)
	console.log(`embedding length   : ${embeddingLength} (model ${embedded?.model})`)
	if (findingsWithExplanations[0]) {
		console.log(`sample explanation : ${findingsWithExplanations[0].relevanceExplanation}`)
	}

	// print the scan report itself so the owner can judge its quality by reading it
	console.log(`scan summary:\n${topicScan.scanSummary}`)

	// the smoke assertions. a real scan produced embeddings, findings, relevance explanations, summed stage costs, and the report
	const results: [string, boolean][] = [
		// topic scan checks
		["scan succeeded", topicScan.status === "succeeded"],
		["found resources", topicScan.foundCount > 0],
		["embedding is 768-dim", embeddingLength === 768],

		// topic findings checks
		["kept_count matches findings", topicScan.keptCount === topicFindings.length],
		["stage_costs sum to cost", Math.abs(totalCost - totalStageCosts) < 1e-6],
		["at least one finding", topicFindings.length > 0],
		["a finding has a relevance explanation", findingsWithExplanations.length > 0],

		// scan report and prompt rendering checks
		["scan summary is non-empty", (topicScan.scanSummary ?? "").trim().length > 0],
		["a relevance explanation is substantive", longestExplanationLength > 200],
		...(await writeSamplePrompts()),
	]

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// write each extracted prompt with sample inputs and report whether the registry served them.
// a non-empty result proves that the Markdown loaded and interpolated
async function writeSamplePrompts(): Promise<[string, boolean][]> {
	// the three single-purpose prompts
	const scoreResult = await buildScorePrompt("sample content", "sample topic context", true)
	const searchResult = await buildSearchPrompt("sample topic context", "sample topic")
	const contextResult = await buildContextPrompt("sample document text")

	// the report prompt renders over a minimal sample scan
	const sampleFinding = { title: "Sample", url: "https://a.test", relevanceScore: 0.9, relevanceExplanation: "note" }
	const reportResult = await buildScanReportPrompt({
		topicName: "sample topic",
		topicContext: "sample topic context",
		date: "January 1, 2026",
		// a single kept finding with zeroed drop tallies
		reviewOutcome: {
			keptFindings: [sampleFinding],
			filteredCounts: { "duplicate content": 0, "near-duplicate": 0, "below relevance threshold": 0 },
			deferredCount: 0,
			failedCount: 0,
		},
		// one healthy source and an untouched budget
		scannedSources: [{ sourceKind: "rss", status: "ok" }],
		budget: { spent: 0, cap: 0.5, stageCosts: { embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 } },
	})

	// report whether the registry actually served this run's prompts, or the worker ran on the bundled Markdown alone
	const servedFromRegistry = [scoreResult, searchResult, contextResult, reportResult].some(
		(result) => result.registryPrompt && !result.registryPrompt.isFallback,
	)
	console.log(`registry serving  : ${servedFromRegistry ? "prompts served from Langfuse" : "bundled markdown only"}`)

	// each prompt renders to a non-empty string
	return [
		["score prompt renders", scoreResult.prompt.length > 0],
		["search prompt renders", searchResult.prompt.length > 0],
		["attachment context prompt renders", contextResult.prompt.length > 0],
		["scan report prompt renders", reportResult.prompt.length > 0],
	]
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

// run the smoke test, computing the exit code rather than exiting early so telemetry can flush first
startTelemetry()
let exitCode: number
try {
	exitCode = await smokeTest()
} catch (error) {
	console.error(error)
	exitCode = 1
}

// flush telemetry before exit, then exit because the Neon pool would otherwise keep the process alive
await shutdownTelemetry()
process.exit(exitCode)
