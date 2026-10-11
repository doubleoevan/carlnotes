// the source llm-guard screening workflow
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./screenSourceActivities"
import { QUEUED_STAGE_TIMEOUT_MS, SCREEN_ATTEMPTS, TRANSIENT_SCREEN_FAILURE } from "./stageTimeouts"

// one bounded fetch plus one llm-guard screen, so the per-attempt timeout is short. the schedule-to-close bound covers
// the wait for a screen slot
const { screenSource, failSource } = proxyActivities<typeof activities>({
	startToCloseTimeout: "2 minutes",
	scheduleToCloseTimeout: QUEUED_STAGE_TIMEOUT_MS,
	retry: { maximumAttempts: SCREEN_ATTEMPTS },
})

// screen one url Source with llm-guard, marking it failed if the screen itself could not run
export async function screenSourceWorkflow(sourceId: string): Promise<void> {
	// the activity records its own verdict, so this catch is only for a screen that never reached one
	try {
		await screenSource(sourceId)
	} catch (error) {
		// leave the Source pending after a transient failure that outlasted every attempt
		if (isTransientScreenFailure(error)) {
			return
		}
		await failSource(sourceId, error instanceof Error ? error.message : String(error))
		throw error
	}
}

// whether an activity failure wraps the transient failure type, which the activity throws for a failure a retry may pass
function isTransientScreenFailure(error: unknown): boolean {
	const cause = (error as { cause?: { type?: string } } | null)?.cause
	return cause?.type === TRANSIENT_SCREEN_FAILURE
}
