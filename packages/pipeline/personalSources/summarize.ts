// each sender has a separate context. The Topic owner pays for summarization, as for a Scan.
import {
	PERSONAL_SOURCES_CONTEXT_INPUT_CHARS,
	PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS,
} from "@carlnotes/contracts/personalSources"
import { db } from "@carlnotes/db"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import {
	commitPersonalSourcesContext,
	failPersonalSourcesContext,
	loadPersonalSourcesContextSnapshot,
	type PersonalSourcesContextSnapshot,
	startPersonalSourcesSummarySpend,
} from "@carlnotes/db/personalSourcesContext"
import { personalSourcesSummarySpends } from "@carlnotes/db/schema/personalSources"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { isBudgetRejection } from "@carlnotes/models/models"
import { reserveUserSpend } from "@carlnotes/models/spendReservations"
import { trackEvent } from "@carlnotes/server/analytics"
import { eq } from "drizzle-orm"
import { writePersonalSourcesContext } from "./contextWriter"

// a conservative reservation covers non-Latin text, template overhead, and the bounded output
const MAX_SUMMARIZATION_DOLLARS = tokenCost(
	PERSONAL_SOURCES_CONTEXT_INPUT_CHARS + PERSONAL_SOURCES_CONTEXT_OUTPUT_CHARS + 4000,
	CHEAP_COST_PER_MILLION_TOKENS,
)
type SummarizationOutcome = "settled" | "stale" | "retry" | "busy" | "idle"

/**
 * Rebuilds the current live revision without returning plaintext through Temporal activity results.
 */
export async function summarizePersonalSourcesContext(topicId: string): Promise<SummarizationOutcome> {
	// a renewable database lease also protects against overlapping activity attempts after worker loss
	const outcome = await runWithJobLease({
		jobName: `personal-sources-context:${topicId}`,
		runTask: async (signal) => {
			const snapshot = await loadPersonalSourcesContextSnapshot(topicId)
			if (!snapshot) {
				return "idle" as const
			}
			if (snapshot.entryIds.length === 0) {
				return (await commitPersonalSourcesContext({ snapshot, context: "", cost: 0 }))
					? ("settled" as const)
					: ("stale" as const)
			}
			if (!snapshot.litellmApiKey) {
				return (await failPersonalSourcesContext({ ...snapshot, state: "missing_key" }))
					? ("retry" as const)
					: ("stale" as const)
			}
			return summarizeSnapshot(snapshot, signal)
		},
	})
	return outcome ?? "busy"
}

// a blocked reservation preserves the entries and leaves a recoverable sender-visible state
async function summarizeSnapshot(
	snapshot: PersonalSourcesContextSnapshot,
	signal: AbortSignal,
): Promise<SummarizationOutcome> {
	const reservation = await reserveUserSpend({
		userId: snapshot.billingUserId,
		kind: "personalSourcesContext",
		maxDollars: MAX_SUMMARIZATION_DOLLARS,
	})
	if (reservation === "rejected") {
		return (await failPersonalSourcesContext({ ...snapshot, state: "budget" })) ? "retry" : "stale"
	}
	try {
		return await generatePersonalSourcesContext(snapshot, signal)
	} finally {
		await reservation.release()
	}
}

// an attempt starts with a conservative cost so a crash cannot erase potentially billed work
async function generatePersonalSourcesContext(
	snapshot: PersonalSourcesContextSnapshot,
	signal: AbortSignal,
): Promise<SummarizationOutcome> {
	const spendId = await startPersonalSourcesSummarySpend(snapshot, MAX_SUMMARIZATION_DOLLARS)
	if (!spendId || !snapshot.litellmApiKey) {
		return "stale"
	}
	try {
		const generated = await writePersonalSourcesContext({
			topic: snapshot.topic,
			entries: snapshot.entries,
			hasIncompleteCoverage: snapshot.hasIncompleteCoverage,
			litellmApiKey: snapshot.litellmApiKey,
			signal,
		})
		const context = generated.text
		const cost =
			generated.totalTokens === undefined
				? MAX_SUMMARIZATION_DOLLARS
				: tokenCost(generated.totalTokens, CHEAP_COST_PER_MILLION_TOKENS)

		// a stale snapshot saves nothing and reports nothing
		if (!(await commitPersonalSourcesContext({ snapshot, context, spendId, cost }))) {
			return "stale"
		}
		trackEvent("personal_sources_context_built", snapshot.userId, {
			entryPoint: "worker",
			topicId: snapshot.topicId,
			entryCount: snapshot.entryIds.length,
			hasIncompleteCoverage: snapshot.hasIncompleteCoverage,
		})
		return "settled"
	} catch (error) {
		// raw provider errors may include input. retain only the budget classification and ambiguous-cost state
		const isBudgetFailure = isBudgetRejection(error)
		await db
			.update(personalSourcesSummarySpends)
			.set({
				state: isBudgetFailure ? "failed" : "unknown",
				cost: isBudgetFailure ? 0 : MAX_SUMMARIZATION_DOLLARS,
				finishedAt: new Date(),
			})
			.where(eq(personalSourcesSummarySpends.id, spendId))
		return (await failPersonalSourcesContext({ ...snapshot, state: isBudgetFailure ? "budget" : "failed" }))
			? "retry"
			: "stale"
	}
}
