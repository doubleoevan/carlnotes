// a live smoke test the owner runs by hand for URL attachment ingestion. it seeds a topic, ingests a real URL through Firecrawl, and checks the generated context and the stored object.
// it makes real proxy, Firecrawl, and S3 calls, so the smoke filename keeps it out of the offline bun test run.
// run it with: bun run smoke:attachments. it needs the LiteLLM proxy reachable at LITELLM_BASE_URL, FIRECRAWL_API_KEY and the S3_* bucket config set, the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { topics, users } from "../db/schema"
import { buildTopicScanContext, ingestUrlAttachment } from "./attach"
import { attachmentExists, deleteAttachment } from "./store"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// the persisted attachment row that ingestUrlAttachment returns
type Attachment = Awaited<ReturnType<typeof ingestUrlAttachment>>

// a real page with plenty of content that Firecrawl scrapes to non-empty Markdown. the scan smoke already depends on the same host, so it is a safe bet to be up
const ATTACHMENT_URL = "https://simonwillison.net/"
// a non-empty topic context, so the merged scan context holds both the topic's own context and the attachment's
const TOPIC_CONTEXT = "Smoke-test topic for URL attachment ingestion."

// seed a fake owner and a topic to attach the URL to
async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and its attachments
	const [user] = await db
		.insert(users)
		.values({ name: "attachment-smoke", email: `attachment-smoke+${Date.now()}@example.test` })
		.returning()
	if (!user) {
		throw new Error("failed to seed user")
	}

	// a topic with its own context, so the merged scan context carries both the topic's and the attachment's context
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: user.id, name: "URL attachment smoke", prompt: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}

	// return the ids the smoke ingests against and cleans up
	return { topicId: topic.id, userId: user.id }
}

// run the smoke assertions over the ingested attachment and print a report. returns true if every check passes
async function check(topicId: string, attachment: Attachment): Promise<boolean> {
	// the merged context a scan would read for this topic, plus whether the raw Markdown object landed in the bucket
	const { context: scanContext } = await buildTopicScanContext(topicId)
	const objectStored = await attachmentExists(attachment.objectKey)

	// prove the empty-fetch guard rejects instead of storing an attachment with no context.
	// the topic is real and the injected fetcher skips Firecrawl and returns nothing, so only the empty fetch can cause the rejection
	let emptyRejected = false
	try {
		await ingestUrlAttachment(topicId, ATTACHMENT_URL, async () => "")
	} catch {
		emptyRejected = true
	}

	// the smoke assertions. ingestion produced a non-empty context that feeds the scan context, the object was stored, the origin URL was recorded, and an empty fetch is rejected
	const contextText = attachment.context.trim()
	const results: [string, boolean][] = [
		["attachment context is non-empty", contextText.length > 0],
		["context appears in topicScanContext", scanContext.includes(contextText)],
		["stored object exists", objectStored],
		["sourceUrl records the origin URL", attachment.sourceUrl === ATTACHMENT_URL],
		["empty fetch is rejected", emptyRejected],
	]

	// print the report
	console.log("\n=== attachment smoke report ===")
	console.log(`object_key    : ${attachment.objectKey}`)
	console.log(`source_url    : ${attachment.sourceUrl}`)
	console.log(`context_chars : ${contextText.length}`)
	console.log(`context_head  : ${contextText.slice(0, 200)}`)

	// print each check and compute the overall result
	let allPassed = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPassed = allPassed && pass
	}
	return allPassed
}

// seed, ingest, and check, then clean up the stored object and the fake owner.
// deleting the owner cascades to the attachment row
async function smokeTest(): Promise<number> {
	const { topicId, userId } = await seedTestData()
	// ingest up front so that the stored object has a reference for cleanup even if an assertion later throws
	let objectKey: string | null = null
	try {
		const attachment = await ingestUrlAttachment(topicId, ATTACHMENT_URL)
		objectKey = attachment.objectKey
		const pass = await check(topicId, attachment)
		console.log(`\n=== smoke ${pass ? "PASSED" : "FAILED"} ===`)
		return pass ? 0 : 1
	} finally {
		// the owner cascade drops the database rows but not the object in the bucket, so delete the object explicitly, then the owner
		if (objectKey) {
			await deleteAttachment(objectKey).catch(() => {})
		}
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
