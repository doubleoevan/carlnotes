// the source llm-guard screening workflow. it decides the order and calls activities, never doing I/O itself.
// fetch the page a url Source names, screen it, and mark the Source ready or failed. the Source is not marked ready until then
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./screen-source-activities"

// one bounded fetch plus one screen, so the per-attempt timeout is short. it is short enough to be the detection window too,
// which is why this does not heartbeat the way a Scan stage does: a dead worker costs two minutes either way.
// the schedule-to-close bounds multiple attempts together, so a Source cannot stay pending past it
const { screenSource, failSource } = proxyActivities<typeof activities>({
	startToCloseTimeout: "2 minutes",
	scheduleToCloseTimeout: "6 minutes",
	retry: { maximumAttempts: 3 },
})

// screen one url Source, marking it failed if the screen itself could not run
export async function screenSourceWorkflow(sourceId: string): Promise<void> {
	// the activity records its own verdict, so this catch is only for a screen that never reached one.
	// a Source left pending would be invisible forever, so the failure has to land on the row
	try {
		await screenSource(sourceId)
	} catch (error) {
		await failSource(sourceId, error instanceof Error ? error.message : String(error))
		throw error
	}
}
