// starts the url Source screen for Sources that are waiting on one

import { db, isSourcePending } from "@carlnotes/db"
import { sources } from "@carlnotes/db/schema/topics"
import { reportError } from "@carlnotes/server/monitoring"
import { and, count, eq } from "drizzle-orm"
import { isTemporalTransportFailure, startSourceScreenWorkflow } from "./temporalClient"

// how long a Topic's first Scan can wait for its Sources to finish their screen, and how often it looks
const SCREEN_WAIT_MS = 30_000
const SCREEN_POLL_MS = 500

/**
 * Starts the url Source screen workflow for every Source still waiting on one, for one Topic or across all of them.
 * Safe to repeat: a Source whose check is already running is rejected by its workflow id,
 * so this starts a freshly saved Source or selects up one whose start never happened.
 */
export async function screenPendingSources(topicId?: string): Promise<void> {
	// select every Source still pending
	const pendingSources = await db
		.select({ id: sources.id })
		.from(sources)
		.where(topicId ? and(isSourcePending, eq(sources.topicId, topicId)) : isSourcePending)

	// one Source that cannot be started never stops the others
	for (const source of pendingSources) {
		try {
			await startSourceScreenWorkflow(source.id)
		} catch (error) {
			// the next sweep attempts this Source again
			console.error(`could not start the screen for source ${source.id}`, error)
			reportError(error, "source-screen", { sourceId: source.id })

			// a Temporal server that cannot be reached fails every later start the same way, so they are left pending
			if (isTemporalTransportFailure(error)) {
				break
			}
		}
	}
}

/**
 * Starts this Topic's pending url Source screens and wait for them to settle, up to a bound.
 * A check that outlasts the bound leaves its unfinished Sources pending, and the next Scan picks them up.
 */
export async function screenTopicSources(topicId: string): Promise<void> {
	await screenPendingSources(topicId)

	// poll the rows instead of the workflows, whose status is what ingest reads
	const waitUntil = Date.now() + SCREEN_WAIT_MS
	while (Date.now() < waitUntil) {
		const [pendingRow] = await db
			.select({ count: count() })
			.from(sources)
			.where(and(eq(sources.topicId, topicId), isSourcePending))

		// every Source reached a verdict, so the Scan can read them
		if ((pendingRow?.count ?? 0) === 0) {
			return
		}
		await Bun.sleep(SCREEN_POLL_MS)
	}
}
