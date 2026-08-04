// a live smoke test for chat retrieval against a real topic:
// rank its findings against a question, check the embedding-model filter, and prove the owner-only attachment rule.
// run it with: bun run smoke:chat, needs LiteLLM
import { and, count, eq, isNotNull, ne } from "drizzle-orm"
import { db } from "../db"
import { EMBED_MODEL_NAME, findings, resources } from "../db/schema"
import { retrieveChatContext } from "./chat/retrieve"

// the question the smoke test asks of whichever topic it finds
const SMOKE_QUESTION = "What is the most important thing here?"

// pick a topic with findings, retrieve against it, and verify the filter and the owner gate
async function smokeTest(): Promise<number> {
	// the first topic that has findings
	const [topicWithFindings] = await db
		.select({ topicId: findings.topicId })
		.from(findings)
		.groupBy(findings.topicId)
		.limit(1)

	// nothing to retrieve against, so the run says what to do about it
	if (!topicWithFindings) {
		console.log("no topic has findings yet. run smoke:scan first")
		return 1
	}

	// how many of this topic's findings are embedded by the current model, and how many by a stale model
	const [[currentModelRow], [staleModelRow]] = await Promise.all([
		db
			.select({ count: count() })
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.where(and(eq(findings.topicId, topicWithFindings.topicId), eq(resources.embeddingModel, EMBED_MODEL_NAME))),
		db
			.select({ count: count() })
			.from(findings)
			.innerJoin(resources, eq(findings.resourceId, resources.id))
			.where(
				and(
					eq(findings.topicId, topicWithFindings.topicId),
					isNotNull(resources.embeddingModel),
					ne(resources.embeddingModel, EMBED_MODEL_NAME),
				),
			),
	])

	// retrieve twice, once as the owner and once as a non-owner, so the attachment rule is visible.
	// the non-owner id should have no kept chat attachments
	const ownerContext = await retrieveChatContext(topicWithFindings.topicId, SMOKE_QUESTION, "chat-smoke-user", true)
	const nonOwnerContext = await retrieveChatContext(topicWithFindings.topicId, SMOKE_QUESTION, "chat-smoke-user", false)
	if (!ownerContext || !nonOwnerContext) {
		console.log("the topic disappeared mid-run")
		return 1
	}

	// the retrieval never returns more than the current-model findings, and a non-owner never sees attachments
	const results: [string, boolean][] = [
		["retrieved at most the current-model findings", ownerContext.findings.length <= (currentModelRow?.count ?? 0)],
		["a non-owner gets no attachment context", nonOwnerContext.attachmentContext === ""],
		["both sides see the same findings", ownerContext.findings.length === nonOwnerContext.findings.length],
		[
			"every retrieved finding includes text or a url",
			ownerContext.findings.every((finding) => finding.text !== "" || finding.url !== ""),
		],
	]

	// print what the chat retrieval found
	console.log("\n=== chat retrieval smoke ===")
	console.log(`topic              : ${ownerContext.topicName}`)
	console.log(`current-model rows : ${currentModelRow?.count ?? 0}`)
	console.log(`stale-model rows   : ${staleModelRow?.count ?? 0} (excluded from ranking)`)
	console.log(`retrieved findings : ${ownerContext.findings.length}`)
	console.log(`scan notes         : ${ownerContext.scanSummaries.length}`)
	console.log(`owner attachments  : ${ownerContext.attachmentContext.length} chars`)

	// print each check and return the overall result
	let allPassed = true
	for (const [label, pass] of results) {
		console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
		allPassed = allPassed && pass
	}
	return allPassed ? 0 : 1
}

// run the smoke test and exit with its result
process.exit(await smokeTest())
