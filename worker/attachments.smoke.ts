// owner-run live smoke for URL attachment ingestion: seed a topic, ingest a real URL via Firecrawl, and assert the context + stored object
// NOT a bun test (it makes real proxy/Firecrawl/S3 calls, so the offline gate ignores this filename); run with: bun run smoke:attachments
// prereqs: the LiteLLM proxy reachable at LITELLM_BASE_URL, FIRECRAWL_API_KEY and the S3_* bucket config set, the latest migration applied, and Doppler secrets injected
import { eq } from "drizzle-orm"
import { db } from "../db"
import { topics, users } from "../db/schema"
import { ingestUrlAttachment, topicScanContext } from "./attachments"
import { attachmentExists, deleteAttachment } from "./storage"

// the persisted attachment row ingestUrlAttachment returns
type Attachment = Awaited<ReturnType<typeof ingestUrlAttachment>>

// a real, reliably-up, content-rich page (the same host the scan smoke already depends on) that Firecrawl scrapes to non-empty markdown
const ATTACHMENT_URL = "https://simonwillison.net/"
// a non-empty topic context so the merged scan context proves the attachment's context is appended alongside the topic's own
const TOPIC_CONTEXT = "Smoke-test topic for URL attachment ingestion."

// seed a throwaway owner and a topic to attach the URL to
async function seed(): Promise<{ topicId: string; userId: string }> {
	// a throwaway owner — the topic and its attachments cascade from it on cleanup
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
		.values({ ownerId: user.id, name: "URL attachment smoke", context: TOPIC_CONTEXT })
		.returning()
	if (!topic) {
		throw new Error("failed to seed topic")
	}
	// hand back the ids the smoke ingests against and cleans up
	return { topicId: topic.id, userId: user.id }
}

// run the smoke assertions over the ingested attachment, printing a report; returns true when all pass
async function check(topicId: string, attachment: Attachment): Promise<boolean> {
	// the merged context a scan would read for this topic, plus whether the raw markdown object landed in the bucket
	const { context: scanContext } = await topicScanContext(topicId)
	const objectStored = await attachmentExists(attachment.objectKey)

	// the empty-fetch guard rejects rather than storing a contextless attachment — real topic (passes the topic check), injected empty fetcher (no Firecrawl call)
	let emptyRejected = false
	try {
		await ingestUrlAttachment(topicId, ATTACHMENT_URL, async () => "")
	} catch {
		emptyRejected = true
	}

	// the smoke assertions: ingestion produced a non-empty context, it feeds the scan context, the object was stored, provenance was recorded, and an empty fetch is rejected
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
	let allPass = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPass = allPass && pass
	}
	return allPass
}

// orchestrate: seed, ingest, check, then always clean up the stored object and the throwaway owner (which cascades the attachment row)
async function main(): Promise<number> {
	const { topicId, userId } = await seed()
	// ingest up front so its stored object is tracked for cleanup even if an assertion later throws
	let objectKey: string | null = null
	try {
		const attachment = await ingestUrlAttachment(topicId, ATTACHMENT_URL)
		objectKey = attachment.objectKey
		const pass = await check(topicId, attachment)
		console.log(`\n=== smoke ${pass ? "PASSED" : "FAILED"} ===`)
		return pass ? 0 : 1
	} finally {
		// the owner cascade drops DB rows but not the R2 object, so delete the object explicitly, then the owner
		if (objectKey) {
			await deleteAttachment(objectKey).catch(() => {})
		}
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
