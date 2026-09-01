// a live smoke test the owner runs by hand for the search ingester
// run it with: bun run smoke:search. it needs EXA_API_KEY set, the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { sources, topics, users } from "../db/schema"
import type { Source } from "./ingest/ingester"
import { searchIngester } from "./ingest/search"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// a coherent topic context so that query generation has a real seed and Exa returns on-topic results
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// one id per run, so fixture rows never collide with an earlier run's
const runId = Date.now()

// seed a fake owner, a topic with a real context
async function seedTestData(): Promise<{ source: Source; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and source
	const [user] = await db
		.insert(users)
		.values({
			name: "search-smoke",
			email: `search-smoke+${runId}@example.test`,
			username: `search-smoke-${runId}`,
			usernameNormalized: `searchsmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic whose context seeds the query generation
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "LLM search smoke", prompt: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// store a search source with no config
	const [source] = await db
		.insert(sources)
		.values({ topicId: topic.id, kind: "search", config: {}, status: "ready" })
		.returning()

	if (!source) {
		throw new Error("failed to seed source")
	}
	return { source, userId: user.id }
}

// run the search ingester, check the smoke assertions, and print a report. returns true if every check passes
async function check(source: Source): Promise<boolean> {
	// run the search ingester
	const { resources, costDollars } = await searchIngester(source)

	// summarize the discovered Resources: their resource kinds, titles, and whether they all have a url
	const resourceKinds = new Set(resources.map((resource) => resource.kind))
	const resourcesWithTitle = resources.filter((resource) => (resource.title ?? "").trim().length > 0)
	const resourcesAllHaveUrl = resources.every((resource) => resource.url.length > 0)
	const resourceKindsAreValid = [...resourceKinds].every(
		(resourceKind) => resourceKind === "read" || resourceKind === "watch",
	)

	// print the smoke test report
	console.log("\n=== search smoke report ===")
	console.log(`resources     : ${resources.length}`)
	console.log(`kinds         : ${[...resourceKinds].join(", ")}`)
	console.log(`with title    : ${resourcesWithTitle.length}`)
	console.log(`cost (Exa $)  : ${costDollars}`)
	// print a sample resource when the search returned anything
	if (resources[0]) {
		console.log(`sample url    : ${resources[0].url}`)
		console.log(`sample title  : ${resources[0].title}`)
	}

	// the smoke assertions. a real search discovered well-formed Resources and Exa reported its spend
	const results: [string, boolean][] = [
		["discovered resources", resources.length > 0],
		["every resource has a url", resourcesAllHaveUrl],
		["resourceKinds are read/watch only", resourceKindsAreValid],
		["cost is positive", costDollars > 0],
	]

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// seed the test data and run the checks, then always delete the fake owner the delete cascades to the topic and source
async function smokeTest(): Promise<number> {
	const { source, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const isPassed = await check(source)
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
