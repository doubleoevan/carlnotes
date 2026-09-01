// a live smoke test the owner runs by hand for X
// so both halves stay proven. run it with: bun run smoke:x. it needs TWITTERAPI_IO_API_KEY set, the LiteLLM proxy reachable at LITELLM_BASE_URL,
import { eq } from "drizzle-orm"
import { db } from "../db"
import { sources, topics, users } from "../db/schema"
import type { Source } from "./ingest/ingester"
import { readHandle, xIngester } from "./ingest/x"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// a coherent topic context so that query generation has a real seed and X returns on-topic conversation
const TOPIC_CONTEXT =
	"Large language models and LLM tooling: building applications with models like Claude and GPT, prompt engineering, embeddings, retrieval, agents, and AI engineering practices."

// an account that posts about the topic often enough that a seven-day window is not empty
const X_HANDLE = "OpenAI"

// a real account that has never posted, which a model can invent its way onto
const DORMANT_HANDLE = "notarealacct99"

// one request per Source at the provider's twenty per response. the report fails if the ingester read past it
const MAX_READS_PER_SOURCE = 20

// one id per run, so the seeded owner's email and username cannot collide with an earlier run's
const runId = Date.now()

// seed a fake owner, a topic with a real context, and an x source naming the handle to follow
async function seedTestData(): Promise<{ source: Source; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and source
	const [user] = await db
		.insert(users)
		.values({
			name: "x-smoke",
			email: `x-smoke+${runId}@example.test`,
			username: `x-smoke-${runId}`,
			usernameNormalized: `xsmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic whose context seeds the query generation
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "LLM x smoke", prompt: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// an x source naming the account it follows
	const [source] = await db
		.insert(sources)
		.values({ topicId: topic.id, kind: "x", config: { handle: X_HANDLE } })
		.returning()
	if (!source) {
		throw new Error("failed to seed source")
	}

	// the owner id is included so the cleanup can cascade from it
	return { source, userId: user.id }
}

// run the X ingester and the handle check for source suggestion, then print a report
async function check(source: Source): Promise<boolean> {
	// run the ingester. it reads the configured handle's recent tweets as "read" Resources
	const { resources, costDollars, fallbackMode } = await xIngester(source)

	// confirm the lookup that source suggestion leans on tells a real posting account from one that nobody holds
	const isRealHandleKept = await isConfirmed(X_HANDLE)
	const isMissingHandleDropped = !(await isConfirmed("zzznosuchacct"))
	const isDormantHandleDropped = !(await isConfirmed(DORMANT_HANDLE))

	// summarize what came back: the urls, the titles, and the engagement counts the tweets included
	const tweetUrlPattern = /^https:\/\/x\.com\/[^/]+\/status\/\d+$/
	const resourcesAreTweetUrls = resources.every((resource) => tweetUrlPattern.test(resource.url))
	const resourcesAreReadKind = resources.every((resource) => resource.kind === "read")
	const resourcesWithSnippet = resources.filter((resource) => (resource.snippet ?? "").trim().length > 0)
	const resourcesWithEngagement = resources.filter((resource) => resource.engagement !== null)

	// print the smoke test report
	console.log("\n=== x smoke report ===")
	console.log(`handle          : @${X_HANDLE}`)
	console.log(`resources       : ${resources.length} (limit ${MAX_READS_PER_SOURCE})`)
	console.log(`with snippet    : ${resourcesWithSnippet.length}`)
	console.log(`with engagement : ${resourcesWithEngagement.length}`)
	console.log(`cost (reads $)  : ${costDollars}`)
	console.log(`fallback mode   : ${fallbackMode ?? "none"}`)

	// print a sample resource when the read returned anything
	if (resources[0]) {
		console.log(`sample url      : ${resources[0].url}`)
		console.log(`sample title    : ${resources[0].title}`)
		console.log(`sample snippet  : ${resources[0].snippet?.slice(0, 120)}`)
	}

	// the smoke test assertions
	const results: [string, boolean][] = [
		["read the handle's tweets", resources.length > 0],
		["every resource is a tweet url", resourcesAreTweetUrls],
		["every resource is a read kind", resourcesAreReadKind],
		["held the per-source read limit", resources.length <= MAX_READS_PER_SOURCE],
		["cost is positive", costDollars > 0],
		["no fallback mode", fallbackMode === undefined],
		["a real posting handle is confirmed", isRealHandleKept],
		["a handle nobody holds is dropped", isMissingHandleDropped],
		["a handle that never posted is dropped", isDormantHandleDropped],
	]

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// whether the lookup confirms this handle, which is what decides a suggestion's fate
async function isConfirmed(handle: string): Promise<boolean> {
	// a refusal is printed instead of ignored, so a rate limit does not read as a missing account
	try {
		await readHandle(handle)
		return true
	} catch (error) {
		console.log(`  ${handle} was not confirmed: ${String(error)}`)
		return false
	}
}

// seed the test data and run the checks, then always delete the fake owner. the delete cascades to the topic and source
async function smokeTest(): Promise<number> {
	const { source, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of the outcome
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
