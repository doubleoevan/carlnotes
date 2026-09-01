// a live smoke test the owner runs by hand for attachment ingestion and its processing workflow
// run it with: bun run smoke:attach. it needs the LiteLLM proxy, the S3_* bucket, a Temporal server with its worker running (bun run dev:temporal), the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { attachments, topics, users } from "../db/schema"
import { buildTopicScanContext, ingestAttachment } from "./attach"
import { attachmentExists, deleteAttachment } from "./store"
import { shutdownTelemetry, startTelemetry } from "./telemetry"

// a persisted attachment row
type Attachment = typeof attachments.$inferSelect

// enough real prose that the model writes a non-empty context from it, and a topic context to merge with
const ATTACHMENT_TEXT =
	"# Raccoon care\n\nRaccoons are omnivores that need a varied diet, secure enclosures, and daily enrichment. " +
	"They reach maturity at about a year, live fifteen to twenty in captivity, and are illegal to keep in many states."
const TOPIC_CONTEXT = "Smoke-test topic for attachment ingestion."
// how long to wait for the workflow to finish before giving up. the worker (bun run dev:temporal) must be running
const PROCESSING_TIMEOUT_MS = 90_000
// one id per run, so fixture rows never collide with an earlier run's
const runId = Date.now()

// seed a fake owner and a topic to attach the URL to
async function seedTestData(): Promise<{ topicId: string; userId: string }> {
	// a fake owner. deleting it on cleanup cascades to the topic and its attachments
	const [user] = await db
		.insert(users)
		.values({
			name: "attachment-smoke",
			email: `attachment-smoke+${runId}@example.test`,
			username: `attachment-smoke-${runId}`,
			usernameNormalized: `attachmentsmoke${runId}`,
		})
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

// poll the attachment row until the workflow marks it ready or failed, or the timeout elapses
async function waitForAttachment(attachmentId: string): Promise<Attachment> {
	// poll once a second until the status leaves pending, then return the finished row
	const processingDeadline = Date.now() + PROCESSING_TIMEOUT_MS
	while (Date.now() < processingDeadline) {
		const [attachment] = await db.select().from(attachments).where(eq(attachments.id, attachmentId))
		if (attachment && attachment.status !== "pending") {
			return attachment
		}
		await Bun.sleep(1000)
	}

	// the workflow never finished in time — most likely the worker isn't running
	throw new Error(
		`attachment still pending after ${PROCESSING_TIMEOUT_MS}ms — is the temporal worker (bun run dev:temporal) running?`,
	)
}

// run the smoke assertions over the pending attachment row and the finished row, and print a report
async function check(topicId: string, pendingAttachment: Attachment, readyAttachment: Attachment): Promise<boolean> {
	// the merged context a scan would read, plus whether the stored object is still in the bucket
	const { context: scanContext } = await buildTopicScanContext(topicId)
	const isObjectStored = await attachmentExists(readyAttachment.objectKey)

	// verify a pending upload, a workflow that finished ready with a context and counts, the object stored, and the guards
	const contextText = readyAttachment.context.trim()
	const results: [string, boolean][] = [
		["upload returns a pending attachment", pendingAttachment.status === "pending"],
		["workflow marks the attachment ready", readyAttachment.status === "ready"],
		["context is non-empty", contextText.length > 0],
		["context appears in topicScanContext", scanContext.includes(contextText)],
		["char_count is recorded", (readyAttachment.charCount ?? 0) > 0],
		["chunk_count is at least one", (readyAttachment.chunkCount ?? 0) >= 1],
		["stored object exists", isObjectStored],
	]

	// print the smoke test report
	console.log("\n=== attachment smoke report ===")
	console.log(`status        : ${pendingAttachment.status} -> ${readyAttachment.status}`)
	console.log(`object_key    : ${readyAttachment.objectKey}`)
	console.log(`char/chunk    : ${readyAttachment.charCount} / ${readyAttachment.chunkCount}`)
	console.log(`context_head  : ${contextText.slice(0, 200)}`)

	// print each check and return the overall result
	let allPassed = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPassed = allPassed && pass
	}
	return allPassed
}

// seed, ingest, wait for the workflow, and check, then clean up the stored object and the fake owner
async function smokeTest(): Promise<number> {
	const { topicId, userId } = await seedTestData()
	// ingest up front so the stored object has a reference for cleanup even if a later step throws an error
	let objectKey: string | null = null
	try {
		const pendingAttachment = await ingestAttachment({
			topicId,
			filename: "raccoon-care.md",
			contentType: "text/markdown",
			bytes: new TextEncoder().encode(ATTACHMENT_TEXT),
		})
		objectKey = pendingAttachment.objectKey
		// wait for the workflow to finish, then run assertions over the result
		const readyAttachment = await waitForAttachment(pendingAttachment.id)
		const isPassed = await check(topicId, pendingAttachment, readyAttachment)
		console.log(`\n=== smoke ${isPassed ? "PASSED" : "FAILED"} ===`)
		return isPassed ? 0 : 1
	} finally {
		// the owner cascade drops the rows but not the bucket object, so delete the object explicitly, then the owner
		if (objectKey) {
			await deleteAttachment(objectKey).catch(() => {})
		}
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
