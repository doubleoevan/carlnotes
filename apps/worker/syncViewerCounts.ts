// the scheduled copy of the viewers of each topic, profile, team, and Topic Post and of each podcast episode's
// listeners from Redis into Postgres, the rebuild of Redis from Postgres on the first sync and after a Redis restart,
// and the daily count flush that follows each copy
import { type DbTransaction, db } from "@carlnotes/db"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { teams } from "@carlnotes/db/schema/teams"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { viewerCounters } from "@carlnotes/db/schema/viewerCounts"
import {
	hasRestoredViewerCounters,
	markViewerCountRefsChanged,
	readViewerCounter,
	readViewerEstimate,
	restoreViewerCounters,
	type SavedViewerCounter,
	takeChangedViewerCountRefs,
	type ViewerCountKind,
	type ViewerCountRef,
} from "@carlnotes/db/viewerCounts"
import { reportError } from "@carlnotes/server/monitoring"
import { eq, sql } from "drizzle-orm"
import { saveDailyCounts } from "./saveDailyCounts"
import { loadViewerCountSeeds } from "./viewerCountSeeds"

// how many refs one save transaction writes
const SAVE_BATCH_SIZE = 100

// the job name that keeps two sweeps from copying the counts at once
const VIEWER_COUNT_SYNC_JOB = "viewer-count-sync"

// one ref's estimate and counter, read from Redis
type ViewerEstimateAndCounter = { viewerCountRef: ViewerCountRef; estimate: number; counter: Uint8Array }

/**
 * Copies every changed count into Postgres under the sync's lease, restoring the saved counters first after a Redis
 * restart, then adds the day buffer's views and plays to the daily counts under the same lease.
 */
export async function syncViewerCounts(): Promise<void> {
	await runWithJobLease({
		jobName: VIEWER_COUNT_SYNC_JOB,
		runTask: async () => {
			await copyViewerCounts()
			await saveDailyCounts()
		},
	})
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
			profileUserId: viewerCounters.profileUserId,
			teamId: viewerCounters.teamId,
			topicPostId: viewerCounters.topicPostId,
			counter: viewerCounters.counter,
		})
		.from(viewerCounters)
	return counterRows.map((counterRow) => ({
		viewerCountRef: toSavedViewerCountRef(counterRow),
		counter: counterRow.counter,
	}))
}

// the reference columns of a saved counter's row
type SavedCounterRefColumns = {
	topicId: string | null
	podcastEpisodeId: string | null
	profileUserId: string | null
	teamId: string | null
	topicPostId: string | null
}

// the ref a saved counter's row names. the check constraint sets exactly one column, so the first one set is the ref
function toSavedViewerCountRef(counterRow: SavedCounterRefColumns): ViewerCountRef {
	const kind =
		(Object.keys(COUNTER_REF_COLUMN_KEYS) as ViewerCountKind[]).find(
			(viewerCountKind) => counterRow[COUNTER_REF_COLUMN_KEYS[viewerCountKind]],
		) ?? "team"
	return { kind, id: counterRow[COUNTER_REF_COLUMN_KEYS[kind]] ?? "" }
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
	// a ref deleted since its view has no row to raise, so its counter is not saved
	const raisedRows = await raiseViewerCount(transaction, viewerCountRef, estimate)
	if (raisedRows.length === 0) {
		return
	}

	// save the counter in the row that names the ref
	const counterRefColumnKey = COUNTER_REF_COLUMN_KEYS[viewerCountRef.kind]
	await transaction
		.insert(viewerCounters)
		.values({ [counterRefColumnKey]: viewerCountRef.id, counter })
		.onConflictDoUpdate({
			target: viewerCounters[counterRefColumnKey],
			set: { counter, updatedAt: new Date() },
		})
}

// the saved counter's column that names each kind of ref
const COUNTER_REF_COLUMN_KEYS = {
	topic: "topicId",
	podcastEpisode: "podcastEpisodeId",
	profile: "profileUserId",
	team: "teamId",
	topicPost: "topicPostId",
} as const satisfies Record<ViewerCountKind, string>

// raise the ref's own count column to the estimate, and return the row it raised, if the ref still exists
function raiseViewerCount(
	transaction: DbTransaction,
	{ kind, id }: ViewerCountRef,
	estimate: number,
): Promise<{ id: string }[]> {
	switch (kind) {
		// a topic's viewers
		case "topic":
			return transaction
				.update(topics)
				.set({ viewerCount: sql`greatest(${topics.viewerCount}, ${estimate})` })
				.where(eq(topics.id, id))
				.returning({ id: topics.id })
		// a podcast episode's listeners
		case "podcastEpisode":
			return transaction
				.update(podcastEpisodes)
				.set({ listenerCount: sql`greatest(${podcastEpisodes.listenerCount}, ${estimate})` })
				.where(eq(podcastEpisodes.id, id))
				.returning({ id: podcastEpisodes.id })
		// a profile's viewers, on its user's row
		case "profile":
			return transaction
				.update(users)
				.set({ profileViewerCount: sql`greatest(${users.profileViewerCount}, ${estimate})` })
				.where(eq(users.id, id))
				.returning({ id: users.id })
		// a team's viewers
		case "team":
			return transaction
				.update(teams)
				.set({ viewerCount: sql`greatest(${teams.viewerCount}, ${estimate})` })
				.where(eq(teams.id, id))
				.returning({ id: teams.id })
		// a Topic Post's viewers
		case "topicPost":
			return transaction
				.update(topicPosts)
				.set({ viewerCount: sql`greatest(${topicPosts.viewerCount}, ${estimate})` })
				.where(eq(topicPosts.id, id))
				.returning({ id: topicPosts.id })
	}
}
