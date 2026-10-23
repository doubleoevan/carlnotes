// the scheduled copy of each topic's viewers and each podcast episode's listeners from Redis into Postgres, and the
// rebuild of Redis from Postgres on the first sync and after a Redis restart
import { type DbTransaction, db } from "@carlnotes/db"
import { runWithClaim } from "@carlnotes/db/claim"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { viewerCounters } from "@carlnotes/db/schema/viewerCounts"
import {
	hasRestoredViewerCounters,
	markViewerCountRefsChanged,
	readViewerCounter,
	readViewerEstimate,
	restoreViewerCounters,
	type SavedViewerCounter,
	takeChangedViewerCountRefs,
	type ViewerCountRef,
} from "@carlnotes/db/viewerCounts"
import { reportError } from "@carlnotes/server/monitoring"
import { eq, sql } from "drizzle-orm"
import { loadViewerCountSeeds } from "./viewerCountSeeds"

// how many refs one save transaction writes
const SAVE_BATCH_SIZE = 100

// the claim that keeps two sweeps from copying the counts at once
const VIEWER_COUNT_SYNC_CLAIM = "viewer-count-sync"

// one ref's estimate and counter, read from Redis
type ViewerEstimateAndCounter = { viewerCountRef: ViewerCountRef; estimate: number; counter: Uint8Array }

/**
 * Copies every changed count into Postgres under the sync's claim, restoring the saved counters first after a Redis
 * restart.
 */
export async function syncViewerCounts(): Promise<void> {
	await runWithClaim({ claimName: VIEWER_COUNT_SYNC_CLAIM, runTask: copyViewerCounts })
}

/**
 * Rebuilds the counters from Postgres on the first sync and after a Redis restart, then copies each changed ref's
 * estimate and counter into Postgres. A ref whose copy fails is listed as changed again for the next sweep.
 */
export async function copyViewerCounts(): Promise<void> {
	// stop if Redis is unreachable
	const isRestored = await hasRestoredViewerCounters()
	if (isRestored === null) {
		return
	}

	// rebuild the counters before any copy, so a counter that restarted empty never replaces a saved one. the views
	// counted since the last sweep are lost with a Redis restart
	if (!isRestored && !(await rebuildViewerCounters())) {
		return
	}

	// take the changed refs and read each one's estimate and counter
	const changedViewerCountRefs = await takeChangedViewerCountRefs()
	if (!changedViewerCountRefs || changedViewerCountRefs.length === 0) {
		return
	}
	const viewerEstimatesAndCounters = await Promise.all(changedViewerCountRefs.map(readViewerEstimateAndCounter))

	// save what was read, and list a ref as changed again if its read failed, or every ref if the save failed
	try {
		const completeReads = viewerEstimatesAndCounters.filter(
			(viewerEstimateAndCounter) => viewerEstimateAndCounter !== null,
		)
		await saveViewerCounts(completeReads)
		const failedReadRefs = changedViewerCountRefs.filter((_, i) => viewerEstimatesAndCounters[i] === null)
		if (failedReadRefs.length > 0) {
			await markViewerCountRefsChanged(failedReadRefs)
		}
	} catch (error) {
		// report the failed save and list every ref as changed again
		console.error("could not save the viewer counts", error)
		reportError(error, "database", { changedCount: String(changedViewerCountRefs.length) })
		await markViewerCountRefsChanged(changedViewerCountRefs)
	}
}

// rebuild the counters from the saved counters and the signed-in people Postgres records, and return whether the
// rebuild finished
async function rebuildViewerCounters(): Promise<boolean> {
	try {
		const [savedCounters, viewerCountSeeds] = await Promise.all([loadSavedCounters(), loadViewerCountSeeds()])
		return await restoreViewerCounters({ savedCounters, viewerCountSeeds })
	} catch (error) {
		// report the failed rebuild
		console.error("could not rebuild the viewer counters", error)
		reportError(error, "database")
		return false
	}
}

// every saved counter with the ref it counts
async function loadSavedCounters(): Promise<SavedViewerCounter[]> {
	const counterRows = await db
		.select({
			topicId: viewerCounters.topicId,
			podcastEpisodeId: viewerCounters.podcastEpisodeId,
			counter: viewerCounters.counter,
		})
		.from(viewerCounters)

	// each row names its topic or its podcast episode
	return counterRows.map((counterRow) => ({
		viewerCountRef: counterRow.topicId
			? { kind: "topic", id: counterRow.topicId }
			: { kind: "podcastEpisode", id: counterRow.podcastEpisodeId ?? "" },
		counter: counterRow.counter,
	}))
}

// one ref's estimate and counter, or null if Redis fails to read the estimate or the counter
async function readViewerEstimateAndCounter(viewerCountRef: ViewerCountRef): Promise<ViewerEstimateAndCounter | null> {
	const [estimate, counter] = await Promise.all([readViewerEstimate(viewerCountRef), readViewerCounter(viewerCountRef)])
	return estimate !== null && counter !== null ? { viewerCountRef, estimate, counter } : null
}

// raise each count column and save each counter a batch of refs at a time, in id order. a count and its counter are
// saved in the same transaction
async function saveViewerCounts(viewerEstimatesAndCounters: ViewerEstimateAndCounter[]): Promise<void> {
	const idOrderedReads = [...viewerEstimatesAndCounters].sort((first, second) =>
		first.viewerCountRef.id.localeCompare(second.viewerCountRef.id),
	)
	for (let start = 0; start < idOrderedReads.length; start += SAVE_BATCH_SIZE) {
		// one short transaction per batch
		const readBatch = idOrderedReads.slice(start, start + SAVE_BATCH_SIZE)
		await db.transaction(async (transaction) => {
			for (const viewerEstimateAndCounter of readBatch) {
				await saveViewerCount(transaction, viewerEstimateAndCounter)
			}
		})
	}
}

// raise the ref's count column to the estimate, never lowering it, then save the counter the estimate came from
async function saveViewerCount(
	transaction: DbTransaction,
	{ viewerCountRef, estimate, counter }: ViewerEstimateAndCounter,
): Promise<void> {
	// whether the ref is a topic, and the row its raise returns
	const isTopic = viewerCountRef.kind === "topic"
	let raisedRows: { id: string }[]

	// raise a topic's viewers
	if (isTopic) {
		raisedRows = await transaction
			.update(topics)
			.set({ viewerCount: sql`greatest(${topics.viewerCount}, ${estimate})` })
			.where(eq(topics.id, viewerCountRef.id))
			.returning({ id: topics.id })
	} else {
		// or a podcast episode's listeners
		raisedRows = await transaction
			.update(podcastEpisodes)
			.set({ listenerCount: sql`greatest(${podcastEpisodes.listenerCount}, ${estimate})` })
			.where(eq(podcastEpisodes.id, viewerCountRef.id))
			.returning({ id: podcastEpisodes.id })
	}

	// a topic or podcast episode deleted since its view has no row to raise, so its counter is not saved
	if (raisedRows.length === 0) {
		return
	}

	// save the counter in the row that names the topic or podcast episode
	await transaction
		.insert(viewerCounters)
		.values(isTopic ? { topicId: viewerCountRef.id, counter } : { podcastEpisodeId: viewerCountRef.id, counter })
		.onConflictDoUpdate({
			target: isTopic ? viewerCounters.topicId : viewerCounters.podcastEpisodeId,
			set: { counter, updatedAt: new Date() },
		})
}
