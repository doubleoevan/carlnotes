// checks the dev Journal with the platform key and prints only aggregate repair counts
import { db } from "@carlnotes/db"
import { repairTopicMemoryClaims } from "@carlnotes/pipeline/repairTopicMemoryClaims"
import { z } from "zod"

if (Bun.env.DOPPLER_CONFIG !== "dev" || !Bun.env.LITELLM_MASTER_KEY) {
	throw new Error("Run the topic memory split under CarlNotes dev Doppler with its model gateway key")
}

try {
	// use the row IDs marked compound by the dev claim audit
	const compoundArgument = Bun.argv.indexOf("--compound-ids")
	const compoundFile = compoundArgument < 0 ? undefined : Bun.argv[compoundArgument + 1]
	const compoundIds: unknown = compoundFile ? await Bun.file(compoundFile).json() : undefined
	if (compoundArgument >= 0 && (!Array.isArray(compoundIds) || !compoundIds.every((id) => typeof id === "string"))) {
		throw new Error("Pass a JSON array of compound topic memory IDs")
	}
	// accept the reviewed wording's verdicts as a private dev repair input
	const auditArgument = Bun.argv.indexOf("--audit")
	const auditFile = auditArgument < 0 ? undefined : Bun.argv[auditArgument + 1]
	const schema = z.record(z.uuid(), z.enum(["compound", "incomplete", "nonclaim"]))
	const audit =
		auditArgument >= 0 ? schema.safeParse(auditFile ? await Bun.file(auditFile).json() : undefined) : undefined
	if (audit && !audit.success) {
		throw new Error("Pass a JSON map of audited topic memory IDs and verdicts")
	}
	const totals = await repairTopicMemoryClaims({
		litellmApiKey: Bun.env.LITELLM_MASTER_KEY,
		onlyUnnamed: Bun.argv.includes("--standalone"),
		compoundIds: Array.isArray(compoundIds) ? compoundIds : undefined,
		auditedVerdicts: audit?.data,
		signal: AbortSignal.timeout(30 * 60_000),
		onPage: (counts) => console.log(JSON.stringify({ counts })),
	})
	console.log(JSON.stringify({ totals }))
	if (totals.deferred > 0) {
		process.exitCode = 1
	}
} catch (error) {
	// gateway responses can contain request details
	const failure = error as { name?: string; statusCode?: number; cause?: { code?: string } }
	const messages = new Set([
		"The topic memory claim check returned incomplete verdicts",
		"The topic memory split returned unreadable claims",
		"A repaired topic memory is missing its embedding",
		"Pass a JSON array of compound topic memory IDs",
		"Pass a JSON map of audited topic memory IDs and verdicts",
	])
	console.error("Dev topic memory repair failed", {
		error: failure.name,
		statusCode: failure.statusCode,
		databaseCode: failure.cause?.code,
		detail: error instanceof Error && messages.has(error.message) ? error.message : undefined,
	})
	process.exitCode = 1
} finally {
	await db.$client.end()
}
