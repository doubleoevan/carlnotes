// a live smoke test for a full topic Scan, ingestion then review: seed a topic and an RSS source, scan, check the outputs.
// run it with: bun run smoke:scan. needs the LiteLLM proxy at LITELLM_BASE_URL, the latest migration, and Doppler secrets
import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, scans, sources, topics, users } from "../db/schema"
import { buildContextPrompt } from "./attach"
// the extracted prompt builders, loaded here to prove that each writes its prompt from its Markdown template
import { buildSearchPrompt } from "./ingest/search"
import { buildScorePrompt } from "./review/score"
import { buildScanReportPrompt } from "./review/summarize"
import { loadScan } from "./scan"
import { shutdownTelemetry, startTelemetry } from "./telemetry"
import { finishScan, ingestForScan, reviewForScan } from "./workflows/run-topic-scan-activities"

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

	// a completed Scan dated now, so that a schedule sweep doesn't race this smoke on the same topic
	await db.insert(scans).values({ topicId: topic.id, ownerId: user.id, status: "succeeded", finishedAt: new Date() })
	return { topicId: topic.id, userId: user.id }
}

// run the topic scan pipeline, check the smoke assertions, and print a report. returns true when every check passes
async function check(topicId: string, ownerId: string): Promise<boolean> {
	// run the full pipeline for the topic, ingestion then review, driving the workflow's own stages in order
	// so the smoke test exercises the real activity code instead of a copy of it, and without needing a Temporal server
	const [openScan] = await db.insert(scans).values({ topicId, ownerId }).returning()
	if (!openScan) {
		throw new Error("could not open a scan for the smoke topic")
	}
	const ingestResult = await ingestForScan(openScan.id, topicId)
	const reviewResult = await reviewForScan(openScan.id, topicId, ownerId, ingestResult, ingestResult.budget)
	await finishScan(openScan.id, topicId, ownerId, "creation", ingestResult, reviewResult)

	// re-read the scan row, since the counts and cost were written by the closing stage
	const topicScan = await loadScan(openScan.id)
	if (!topicScan) {
		throw new Error("the scan row vanished mid-smoke")
	}

	// read this topic's findings and one embedded resource from this scan, joined through the findings
	// so the length assertion can't pass on an unrelated topic's vector left in the shared resources table
	const topicFindings = await db.select().from(findings).where(eq(findings.topicId, topicId))
	const [topic] = await db.select({ maxResults: topics.maxResults }).from(topics).where(eq(topics.id, topicId))

	// the scan's kept_count is what review wrote, and the topic is then trimmed to its max_results,
	// so the rows that survive must be the smaller of the two
	const expectedFindingCount = Math.min(topicScan.keptCount, topic?.maxResults ?? 0)
	const [embedded] = await db
		.select({ embedding: resources.embedding, model: resources.embeddingModel })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.topicId, topicId), isNotNull(resources.embedding)))
		.limit(1)

	// for an RSS-only scan, ingestion cost is 0, so the total cost should equal the sum of the review stage costs
	const totalCost = Number(topicScan.cost)
	const totalStageCosts = Object.values(topicScan.stageCosts).reduce((sum, value) => sum + value, 0)
	const findingsWithExplanations = topicFindings.filter((finding) => finding.relevanceExplanation.trim().length > 0)
	const embeddingLength = vectorLength(embedded?.embedding)

	// the longest relevance explanation must be substantive, well beyond one line
	const explanationLengths = topicFindings.map((finding) => finding.relevanceExplanation.trim().length)
	const longestExplanationLength = Math.max(0, ...explanationLengths)

	// print the smoke test report
	console.log("\n=== topic scan smoke report ===")
	console.log(`scan.status        : ${topicScan.status}`)
	console.log(`found/kept/filtered: ${topicScan.foundCount} / ${topicScan.keptCount} / ${topicScan.filteredCount}`)
	console.log(`cost               : ${totalCost}`)
	console.log(`stage_costs        : ${JSON.stringify(topicScan.stageCosts)} (sum ${totalStageCosts.toFixed(6)})`)
	// print the findings and embedding report
	console.log(
		`findings           : ${topicFindings.length} of ${expectedFindingCount} expected (with explanations: ${findingsWithExplanations.length})`,
	)
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
		["embedding is 1024-dim", embeddingLength === 1024],

		// topic findings checks
		["findings match kept_count capped by max_results", topicFindings.length === expectedFindingCount],
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
		// a single kept finding with zeroed drop totals
		reviewOutcome: {
			keptFindings: [sampleFinding],
			filteredCounts: {
				"duplicate content": 0,
				"near-duplicate": 0,
				"below relevance threshold": 0,
				"flagged by scanner": 0,
			},
			deferredCount: 0,
			failedCount: 0,
		},
		// one healthy source and an untouched budget
		scannedSources: [{ sourceKind: "rss", status: "ok" }],
		budget: {
			spent: 0,
			cap: 0.5,
			stageCosts: { ingestion: 0, embedding: 0, fetch: 0, scoringCheap: 0, scoringPremium: 0 },
			maxScoredResources: 25,
			fetchCounts: { reusedCount: 0, revalidatedCount: 0, fetchedCount: 0 },
		},
	})

	// report whether the registry actually served this run's prompts, or the worker ran on the bundled Markdown alone
	const servedFromRegistry = [scoreResult, searchResult, contextResult, reportResult].some(
		(result) => result.registryPrompt && !result.registryPrompt.isFallback,
	)
	console.log(`registry serving  : ${servedFromRegistry ? "prompts served from Langfuse" : "bundled markdown only"}`)

	// each prompt renders to a non-empty string, and each one fences its untrusted inputs and closes with our own words.
	// the registry serves these bodies too, so this is what catches a prompt edited in the Langfuse ui without the fence
	const builtPrompts: [string, string][] = [
		["score prompt", scoreResult.prompt],
		["search prompt", searchResult.prompt],
		["attachment context prompt", contextResult.prompt],
		["scan report prompt", reportResult.prompt],
	]
	return builtPrompts.flatMap(([label, prompt]) => [
		[`${label} renders`, prompt.length > 0],
		[`${label} fences its untrusted inputs`, isFenced(prompt)],
		// the fence closes above the final line, so a prompt ending on a closing tag ends on a value
		[`${label} restates the task last`, !prompt.trimEnd().endsWith(">")],
	])
}

// whether a written prompt wraps its untrusted values in a matched nonce delimiter
function isFenced(prompt: string): boolean {
	// requires an open tag with a nonce, and a close tag carrying the same nonce
	const openTag = prompt.match(/<untrusted-data-([0-9a-f-]{36})>/)
	return Boolean(openTag && prompt.includes(`</untrusted-data-${openTag[1]}>`))
}

// seed the test data and run the checks, then always delete the fake owner
async function smokeTest(): Promise<number> {
	const { topicId, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const isPassed = await check(topicId, userId)
		console.log(`\n=== smoke ${isPassed ? "PASSED" : "FAILED"} ===`)
		return isPassed ? 0 : 1
	} finally {
		await db.delete(users).where(eq(users.id, userId))
	}
}

// run the smoke test, computing the exit code instead of exiting early so telemetry can flush first
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
