// a live smoke test the owner runs by hand for the search adapter. it seeds a topic and a search source, runs searchAdapter, and checks that it discovered Resources
// run it with: bun run smoke:search. it needs EXA_API_KEY set, the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { sources, topics, users } from "../db/schema"
import type { Source } from "./adapters/adapter"
import { searchAdapter } from "./adapters/search"

// a coherent topic context so that query generation has a real seed and Exa returns on-topic results
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// seed a fake owner, a topic with a real context, and a search source
// search needs no config because the topic context is its input
async function seedTestData(): Promise<{ source: Source; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and source
	const [user] = await db
		.insert(users)
		.values({ name: "search-smoke", email: `search-smoke+${Date.now()}@example.test` })
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

	// a search source with no config. the topic context drives the search adapter
	const [source] = await db.insert(sources).values({ topicId: topic.id, kind: "search", config: {} }).returning()
	if (!source) {
		throw new Error("failed to seed source")
	}
	return { source, userId: user.id }
}

// run the search adapter, check the smoke assertions, and print a report. returns true when every check passes
async function check(source: Source): Promise<boolean> {
	// run the search adapter. it turns the topic context into queries, searches with the queries, and returns Resources, with playlists expanded into "watch" Resources
	const { resources, cost } = await searchAdapter(source)

	// summarize the discovered Resources: their resource kinds, titles, and whether they all have a url
	const resourceKinds = new Set(resources.map((resource) => resource.kind))
	const resourcesWithTitle = resources.filter((resource) => (resource.title ?? "").trim().length > 0)
	const resourcesAllHaveUrl = resources.every((resource) => resource.url.length > 0)
	const resourceKindsAreValid = [...resourceKinds].every(
		(resourceKind) => resourceKind === "read" || resourceKind === "watch",
	)

	// print the report header and counts
	console.log("\n=== search smoke report ===")
	console.log(`resources     : ${resources.length}`)
	console.log(`kinds         : ${[...resourceKinds].join(", ")}`)
	console.log(`with title    : ${resourcesWithTitle.length}`)
	console.log(`cost (Exa $)  : ${cost}`)
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
		["cost is positive", cost > 0],
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
// the delete cascades to the topic and source
async function smokeTest(): Promise<number> {
	const { source, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const pass = await check(source)
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
