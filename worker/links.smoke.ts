// a live smoke test for the links a url Source finds: seed a topic and two url Sources, ingest twice,
// and check what the page contributed, what it was billed, and what a page that cannot be fetched still leaves behind.
// run it with: bun run smoke:links. needs FIRECRAWL_API_KEY, object storage, and the latest migration.
// it stops after ingestion, since finding the links is entirely an ingest-stage behavior and review costs real money
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { resources, scans, sources, topics, users } from "../db/schema"
import { FIRECRAWL_COST_PER_FETCH } from "./budget"
import { ingestForScan } from "./workflows/run-topic-scan-activities"

// a page that lists links to other sites
const INDEX_URL = "https://news.ycombinator.com/"
// a reserved tld that never resolves, to prove a page that cannot be read still returns a Resource for review to attempt to fetch
const UNFETCHABLE_URL = "https://carlnotes-smoke-no-such-host.invalid/page"

// seed an owner, a topic, and the two url Sources. ready, since ingest skips a Source that has not been screened
// append a stamp for the database to persist a unique identifier for fixture data
const smokeTestStamp = Date.now()

async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic, its Sources, and its Scans
	const [user] = await db
		.insert(users)
		.values({
			name: "links-smoke",
			email: `links-smoke+${smokeTestStamp}@example.test`,
			username: `links-smoke-${smokeTestStamp}`,
			usernameNormalized: `linkssmoke${smokeTestStamp}`,
		})
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic broad enough that nothing the index page lists is off-subject
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "Links smoke", prompt: "Anything technology users are discussing today." })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// the index page is the case under test, and the unfetchable one proves the Source still runs
	await db.insert(sources).values([
		{ topicId: topic.id, kind: "url", config: { url: INDEX_URL }, status: "ready" },
		{ topicId: topic.id, kind: "url", config: { url: UNFETCHABLE_URL }, status: "ready" },
	])
	return { topicId: topic.id, userId: user.id }
}

// run one ingest for the topic and return what the Scan recorded, including the urls it found
async function ingestOnce(
	topicId: string,
	ownerId: string,
): Promise<{ foundCount: number; ingestionCost: number; urls: string[] }> {
	const [openScan] = await db.insert(scans).values({ topicId, ownerId }).returning()
	if (!openScan) {
		throw new Error("could not open a scan for the links smoke")
	}
	const ingestResult = await ingestForScan(openScan.id, topicId)
	return {
		foundCount: ingestResult.foundCount,
		ingestionCost: ingestResult.budget.stageCosts.ingestion,
		urls: ingestResult.resources.map((resource) => resource.url),
	}
}

// ingest twice and check what the page found, what it cost, and what it cost the second time
async function check(topicId: string, ownerId: string): Promise<boolean> {
	const firstIngest = await ingestOnce(topicId, ownerId)
	const secondIngest = await ingestOnce(topicId, ownerId)

	// the two pages the Sources named, read back from the rows the ingestion wrote
	const sourceUrls = [INDEX_URL, UNFETCHABLE_URL]
	const storedResources = await db.select().from(resources).where(inArray(resources.url, firstIngest.urls))
	const pageResource = storedResources.find((resource) => isSameUrl(resource.url, INDEX_URL))
	const failedPageResource = storedResources.find((resource) => resource.url === UNFETCHABLE_URL)

	// the found links are whatever came back that is not one of the two Source urls themselves
	const foundLinks = storedResources.filter(
		(resource) => !sourceUrls.some((sourceUrl) => isSameUrl(resource.url, sourceUrl)),
	)
	const linksWithSnippets = foundLinks.filter((link) => (link.snippet ?? "").trim().length > 0)

	// what the two ingests found and what each was billed
	console.log("\n=== url source links smoke report ===")
	console.log(`found (1st / 2nd)  : ${firstIngest.foundCount} / ${secondIngest.foundCount}`)
	console.log(`ingestion cost 1st : ${firstIngest.ingestionCost} (one fetch is ${FIRECRAWL_COST_PER_FETCH})`)
	console.log(`ingestion cost 2nd : ${secondIngest.ingestionCost}`)

	// what the page itself found
	console.log(`links found      : ${foundLinks.length} (with anchor-text snippets: ${linksWithSnippets.length})`)
	console.log(`page content_key   : ${pageResource?.contentKey ?? "unset"}`)
	console.log(`page kinds         : ${JSON.stringify(countResourceKinds(foundLinks))}`)
	if (linksWithSnippets[0]) {
		console.log(`sample link        : ${linksWithSnippets[0].url}`)
		console.log(`sample snippet     : ${linksWithSnippets[0].snippet}`)
	}

	// what the page found, what it was billed, and what a page that could not be read still left behind
	const results: [string, boolean][] = [
		// the page contributed the material it indexes, each link including the words it was written as
		["the page contributed its links", foundLinks.length > 1],
		["links carry anchor text", linksWithSnippets.length > 0],
		// the body was stored at ingestion, which is what lets review reuse it instead of paying to scrape again
		["the page's body was stored", Boolean(pageResource?.contentKey)],
		["the first ingest paid for one fetch", firstIngest.ingestionCost === FIRECRAWL_COST_PER_FETCH],
		// the second ingestion reads the stored body, so it finds the same links for nothing
		["the second ingest paid nothing", secondIngest.ingestionCost === 0],
		["the second ingest still found the links", secondIngest.foundCount === firstIngest.foundCount],
		// a page that could not be fetched still reaches review, which attempts to fetch it again
		["an unfetchable page still became a Resource", Boolean(failedPageResource)],
		["an unfetchable page stored no body", !failedPageResource?.contentKey],
	]

	console.log("")
	for (const [label, passed] of results) {
		console.log(`${passed ? "PASS" : "FAIL"}  ${label}`)
	}
	return results.every(([, passed]) => passed)
}

// whether two urls point to the same page, ignoring the trailing slash canonicalization drops
function isSameUrl(url: string, otherUrl: string): boolean {
	return url.replace(/\/$/, "") === otherUrl.replace(/\/$/, "")
}

// how many of each resource kind the page found, so a linked video shows up as a watch instead of a read
function countResourceKinds(foundLinks: (typeof resources.$inferSelect)[]): Record<string, number> {
	const resourceKindCounts: Record<string, number> = {}
	for (const link of foundLinks) {
		resourceKindCounts[link.kind] = (resourceKindCounts[link.kind] ?? 0) + 1
	}
	return resourceKindCounts
}

// returns every Resource url stored right now
async function readStoredUrls(): Promise<Set<string>> {
	const storedRows = await db.select({ url: resources.url }).from(resources)
	return new Set(storedRows.map((row) => row.url))
}

// delete the seeded owner, which cascades to the topic, its Sources, its Scans, and its Findings,
// then delete only the Resources this run introduced
async function cleanUp(userId: string, urlsBefore: Set<string>): Promise<void> {
	await db.delete(users).where(eq(users.id, userId))
	const addedUrls = [...(await readStoredUrls())].filter((url) => !urlsBefore.has(url))
	if (addedUrls.length > 0) {
		await db.delete(resources).where(inArray(resources.url, addedUrls))
	}
}

// snapshot what was already stored, seed, check, then clean up only what this run added
const urlsBefore = await readStoredUrls()
const { topicId, userId } = await seedTestData()
try {
	const isPassing = await check(topicId, userId)
	await cleanUp(userId, urlsBefore)
	process.exit(isPassing ? 0 : 1)
} catch (error) {
	console.error("url source links smoke failed", error)
	await cleanUp(userId, urlsBefore)
	process.exit(1)
}
