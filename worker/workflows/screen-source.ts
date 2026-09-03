// the source llm-guard screening workflow
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./screen-source-activities"

// one bounded fetch plus one llm-guard screen, so the per-attempt timeout is short
const { screenSource, failSource } = proxyActivities<typeof activities>({
	startToCloseTimeout: "2 minutes",
	scheduleToCloseTimeout: "6 minutes",
	retry: { maximumAttempts: 3 },
})

// screen one url Source with llm-guard, marking it failed if the screen itself could not run
export async function screenSourceWorkflow(sourceId: string): Promise<void> {
	// the activity records its own verdict, so this catch is only for an llm-guard screen that never reached one
	try {
		await screenSource(sourceId)
	} catch (error) {
		await failSource(sourceId, error instanceof Error ? error.message : String(error))
		throw error
	}
}
