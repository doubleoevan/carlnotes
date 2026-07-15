// owner-run live smoke for the search adapter (the scout): seed a topic + search source, run searchAdapter, and assert it discovered Resources
// NOT a bun test (it makes real Exa + LiteLLM proxy calls, so the offline gate ignores this filename); run with: bun run smoke:search
// prereqs: EXA_API_KEY set, the LiteLLM proxy reachable at LITELLM_BASE_URL, the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { sources, topics, users } from "../db/schema"
import type { Source } from "./adapters/adapter"
import { searchAdapter } from "./adapters/search"

// a coherent topic context so query generation has a real seed and Exa returns on-topic results
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// seed a throwaway owner, a topic with a real context, and a search source (search needs no config — the context is its input)
async function seed(): Promise<{ source: Source; userId: string }> {
	// a throwaway owner — topic/source cascade from it on cleanup
	const [user] = await db
		.insert(users)
		.values({ name: "search-smoke", email: `search-smoke+${Date.now()}@example.test` })
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}
	// a topic whose context seeds query generation
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "LLM search smoke", context: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}
	// a search source — no config; the topic context drives the scout
	const [source] = await db.insert(sources).values({ topicId: topic.id, kind: "search", config: {} }).returning()
	if (!source) {
		throw new Error("failed to seed source")
	}
	return { source, userId: user.id }
}

// run the search adapter and check the smoke assertions, printing a report; returns true when all pass
async function check(source: Source): Promise<boolean> {
	// run the scout: context → LLM queries → Exa → Resources (playlist results expand to watch Resources)
	const { resources, cost } = await searchAdapter(source)

	// summarize the discovered Resources: kinds, titles, and whether every one carries a url
	const kinds = new Set(resources.map((resource) => resource.kind))
	const withTitle = resources.filter((resource) => (resource.title ?? "").trim().length > 0)
	const allHaveUrl = resources.every((resource) => resource.url.length > 0)
	const validKinds = [...kinds].every((kind) => kind === "read" || kind === "watch")

	// print the report header and counts
	console.log("\n=== search smoke report ===")
	console.log(`resources     : ${resources.length}`)
	console.log(`kinds         : ${[...kinds].join(", ")}`)
	console.log(`with title    : ${withTitle.length}`)
	console.log(`cost (Exa $)  : ${cost}`)
	// print a sample resource when the search returned anything
	if (resources[0]) {
		console.log(`sample url    : ${resources[0].url}`)
		console.log(`sample title  : ${resources[0].title}`)
	}

	// the smoke assertions: a real search discovered well-formed Resources and Exa reported its spend
	const results: [string, boolean][] = [
		["discovered resources", resources.length > 0],
		["every resource has a url", allHaveUrl],
		["kinds are read/watch only", validKinds],
		["cost is positive", cost > 0],
	]
	// print each check and compute the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// orchestrate: seed, check, always clean up the throwaway owner (cascades topic/source)
async function main(): Promise<number> {
	const { source, userId } = await seed()
	// run the checks, then delete the owner regardless of outcome
	try {
		const pass = await check(source)
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
