// the source llm-guard screening workflow

import { toActivityApplicationFailure } from "@carlnotes/contracts/scanFailure"
import {
	QUEUED_STAGE_TIMEOUT_MS,
	RETRYABLE_SCREEN_FAILURE_TYPE,
	SCREEN_ATTEMPTS,
} from "@carlnotes/pipeline/stageTimeouts"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./screenSourceActivities"

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
		// leave the Source pending after a retryable failure that outlasted every attempt
		if (toActivityApplicationFailure(error)?.type === RETRYABLE_SCREEN_FAILURE_TYPE) {
			return
		}
		await failSource(sourceId, error instanceof Error ? error.message : String(error))
		throw error
	}
}
