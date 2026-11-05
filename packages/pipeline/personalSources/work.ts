// durable dirty revisions recover even when the caller stops before notifying Temporal

import { loadPendingPersonalSourcesEmailIds } from "@carlnotes/db/personalSourcesEmailReceipts"
import { loadPendingPersonalSourcesTopicIds } from "@carlnotes/db/personalSourcesWork"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { startPersonalSourcesContextWorkflow, startPersonalSourcesEmailWorkflow } from "../temporalClient"

/**
 * Notifies the Topic workflow after commit while preserving sweep recovery on a transport outage.
 */
export async function notifyPersonalSourcesChanged(topicId: string): Promise<void> {
	try {
		await startPersonalSourcesContextWorkflow(topicId)
	} catch {
		// the durable revision remains pending. a content-free warning never prints provider input
		console.warn("Personal sources workflow notification deferred to sweep recovery")
	}
}

/**
 * Dispatches dirty Topics independently of receiving feature flags.
 */
export async function recoverPersonalSourcesWork(signal?: AbortSignal): Promise<void> {
	const [topics, receipts] = await Promise.all([
		loadPendingPersonalSourcesTopicIds(),
		loadPendingPersonalSourcesEmailIds(),
	])
	const jobs = [
		...topics.map((id) => () => startPersonalSourcesContextWorkflow(id)),
		...receipts.map((id) => () => startPersonalSourcesEmailWorkflow(id)),
	]
	// each start has its own transport timeout. A failed batch leaves unstarted jobs durable for the next sweep.
	const deadline = Date.now() + 10_000
	let transportFailed = false
	await runWithConcurrency(jobs, 4, async (start) => {
		signal?.throwIfAborted()
		if (transportFailed || Date.now() >= deadline) {
			return
		}
		try {
			await start()
		} catch {
			transportFailed = true
		}
	})
	if (transportFailed) {
		console.warn("Personal sources recovery deferred until the next sweep")
	}
}

/**
 * Dispatches acknowledged email while retaining sweep recovery if Temporal is unavailable.
 */
export async function notifyPersonalSourcesEmail(receiptId: string): Promise<void> {
	try {
		await startPersonalSourcesEmailWorkflow(receiptId)
	} catch {
		console.warn("Personal sources email notification deferred to sweep recovery")
	}
}
