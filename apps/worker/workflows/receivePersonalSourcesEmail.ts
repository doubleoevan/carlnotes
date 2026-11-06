// confirmation identifiers cross workflow history, while message bodies stay inside activities
import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "./receivePersonalSourcesEmailActivities"

const { receivePersonalSourcesEmailAttempt } = proxyActivities<typeof activities>({
	startToCloseTimeout: "5 minutes",
	retry: { maximumAttempts: 3, initialInterval: "10 seconds" },
})

/**
 * Receives a durable email job with bounded provider retries and restart-safe waits.
 */
export async function receivePersonalSourcesEmail(confirmationId: string): Promise<void> {
	// retry until an attempt finishes
	for (let i = 0; i < 32; i += 1) {
		const { retryAfterMs } = await receivePersonalSourcesEmailAttempt(confirmationId)
		if (retryAfterMs === null) {
			return
		}
		await sleep(retryAfterMs)
	}
	// continue as new to keep the history short
	return continueAsNew<typeof receivePersonalSourcesEmail>(confirmationId)
}
