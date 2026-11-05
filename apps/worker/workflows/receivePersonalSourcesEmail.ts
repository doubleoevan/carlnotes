// receipt identifiers cross workflow history, while message bodies stay inside activities
import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow"
import type * as activities from "./receivePersonalSourcesEmailActivities"

const { receivePersonalSourcesEmailAttempt } = proxyActivities<typeof activities>({
	startToCloseTimeout: "5 minutes",
	retry: { maximumAttempts: 3, initialInterval: "10 seconds" },
})

/**
 * Receives a durable email job with bounded provider retries and restart-safe waits.
 */
export async function receivePersonalSourcesEmail(receiptId: string): Promise<void> {
	for (let i = 0; i < 32; i += 1) {
		const { retryAfterMs } = await receivePersonalSourcesEmailAttempt(receiptId)
		if (retryAfterMs === null) {
			return
		}
		await sleep(retryAfterMs)
	}
	return continueAsNew<typeof receivePersonalSourcesEmail>(receiptId)
}
