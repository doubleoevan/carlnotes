// a live smoke test that the owner runs by hand for the reddit ingester
// run it with: bun run smoke:reddit. run it from the deployed environment to settle the datacenter-IP
import { eq } from "drizzle-orm"
import { db } from "../db"
import { sources, topics, users } from "../db/schema"
import type { Source } from "./ingest/ingester"
import { redditIngester } from "./ingest/reddit"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// a busy subreddit, and a query common enough inside it that a search returns posts
const SMOKE_SUBREDDIT = "programming"
const SMOKE_QUERY = "rust"

// one id per run, so fixture rows never collide with an earlier run's
const runId = Date.now()

// seed a fake owner, a topic, and the two Source shapes the ingester supports
async function seedTestData(): Promise<{ subredditSource: Source; searchSource: Source; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and its sources
	const [user] = await db
		.insert(users)
		.values({
			name: "reddit-smoke",
			email: `reddit-smoke+${runId}@example.test`,
			username: `reddit-smoke-${runId}`,
			usernameNormalized: `redditsmoke${runId}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic to hang the sources on. a reddit Source reads its own config, so the topic's text is never read
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "reddit smoke", prompt: "agents, prompting, and AI engineering" })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// one Source reading a subreddit listing, and one searching inside that same subreddit
	const seededSources = await db
		.insert(sources)
		.values([
			{ topicId: topic.id, kind: "reddit" as const, config: { subreddit: SMOKE_SUBREDDIT } },
			{ topicId: topic.id, kind: "reddit" as const, config: { subreddit: SMOKE_SUBREDDIT, query: SMOKE_QUERY } },
		])
		.returning()
	const [subredditSource, searchSource] = seededSources
	if (!subredditSource || !searchSource) {
		throw new Error("failed to seed sources")
	}
	return { subredditSource, searchSource, userId: user.id }
}

// run one Source and report what came back, or the reason each access mode rejected it
async function checkSource(label: string, source: Source): Promise<boolean> {
	// the ingester selects its own access modes from the environment, so this is exactly what a Scan would do
	try {
		const { resources, fallbackMode } = await redditIngester(source)

		// a reported fallback mode means the keyless host served this Source, and none means OAuth did
		console.log(`\n--- ${label} ---`)
		console.log(`mode          : ${fallbackMode ?? "oauth"}`)
		console.log(`resources     : ${resources.length}`)

		// the first Resource, to show the payload carried a title, a snippet, and a score in whichever access mode ran
		console.log(`sample url    : ${resources[0]?.url ?? "none"}`)
		console.log(`sample title  : ${resources[0]?.title ?? "none"}`)
		console.log(`sample snippet: ${resources[0]?.snippet?.slice(0, 80) ?? "none"}`)
		console.log(`engagement    : ${resources[0]?.engagement ?? "none"}`)
		return resources.length > 0
	} catch (error) {
		// every access mode rejected. the message names each one, which is what a Scan traces and the report reads
		console.log(`\n--- ${label} ---`)
		console.log(`rejected       : ${error instanceof Error ? error.message : String(error)}`)
		return false
	}
}

// run both Sources and print the smoke report. returns true if both returned Resources
async function check(subredditSource: Source, searchSource: Source): Promise<boolean> {
	console.log("\n=== reddit smoke report ===")
	console.log(`credentials   : ${Bun.env.REDDIT_CLIENT_ID && Bun.env.REDDIT_CLIENT_SECRET ? "set" : "absent"}`)

	// each Source is run in turn instead of together, so the report reads as two separate results
	const isSubredditOk = await checkSource(`subreddit r/${SMOKE_SUBREDDIT}`, subredditSource)
	const isSearchOk = await checkSource(`search for "${SMOKE_QUERY}" in r/${SMOKE_SUBREDDIT}`, searchSource)

	// print each check and return the overall result
	let allPass = true
	for (const [label, pass] of [
		["subreddit Source found resources", isSubredditOk],
		["search Source found resources", isSearchOk],
	] as [string, boolean][]) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// seed the test data and run the checks, then always delete the fake owner
async function smokeTest(): Promise<number> {
	const { subredditSource, searchSource, userId } = await seedTestData()
	// run the checks, then delete the owner regardless of outcome
	try {
		const isPassed = await check(subredditSource, searchSource)
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

// flush telemetry, then report the outcome as the exit code
await shutdownTelemetry()
process.exitCode = exitCode
