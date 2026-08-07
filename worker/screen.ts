// starts the llm-guard screen for Sources that are waiting on one. a Source row is written before its workflow starts,
// so a process that dies in that gap leaves a Source pending with nothing behind it
import { reportError } from "@shared/monitoring"
import { and, count, eq } from "drizzle-orm"
import { db } from "../db"
import { sources } from "../db/schema"
import { startSourceScreenWorkflow } from "./temporal-client"

// how long a Topic's first Scan can wait for its Sources to finish screening, and how often it checks.
// bounded, so a page that will not load delays that Scan by half a minute instead of the llm-guard screen's full limit
const SCREEN_WAIT_MS = 30_000
const SCREEN_POLL_MS = 500

/**
 * Start the screening workflow for every Source still waiting on one, for one Topic or across all of them.
 * Safe to repeat: a Source whose screen is already running is rejected by its workflow id,
 * so this starts a freshly saved Source or picks up one whose start never happened.
 */
export async function screenPendingSources(topicId?: string): Promise<void> {
	// select every Source still pending. one whose llm-guard screen is running is rejected instead of filtered out here,
	// because the live workflow is the source of truth and the source row may be stale
	const isPending = eq(sources.status, "pending")
	const pendingSources = await db
		.select({ id: sources.id })
		.from(sources)
		.where(topicId ? and(isPending, eq(sources.topicId, topicId)) : isPending)

	// one Source that cannot be started never stops the others. it stays pending, since a start could fail when Temporal is unreachable
	// instead of because something is wrong with the Source
	// only a pending Source is picked up again. failed is reserved for a llm-guard screen that reached a verdict
	for (const source of pendingSources) {
		try {
			await startSourceScreenWorkflow(source.id)
		} catch (error) {
			// the next sweep tries this Source again
			console.error(`could not start the screen for source ${source.id}`, error)
			reportError(error, "source-screen", { sourceId: source.id })
		}
	}
}

/**
 * Start this Topic's pending llm-guard screens and wait for them to settle, up to a bound.
 * An llm-guard screen that outlasts the bound leaves its unfinished Sources pending, and the next Scan picks it up.
 */
export async function screenTopicSources(topicId: string): Promise<void> {
	await screenPendingSources(topicId)

	// poll the rows instead of the workflows, since the row status is what ingest reads
	const waitUntil = Date.now() + SCREEN_WAIT_MS
	while (Date.now() < waitUntil) {
		const [pendingRow] = await db
			.select({ count: count() })
			.from(sources)
			.where(and(eq(sources.topicId, topicId), eq(sources.status, "pending")))

		// every Source reached a verdict, so the Scan can read them
		if ((pendingRow?.count ?? 0) === 0) {
			return
		}
		await Bun.sleep(SCREEN_POLL_MS)
	}
}
